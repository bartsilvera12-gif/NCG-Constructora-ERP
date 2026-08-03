import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listCompras, insertCompraMultiConImpacto } from "@/lib/compras/server/compras-pg";
import { asentarBackgroundServer } from "@/lib/contabilidad/asentar-server";
import type { CompraItemInput } from "@/lib/compras/server/compras-pg";
import { getPais, rateOf, calcularMontos } from "@/lib/iva/config";

const IVA_OK = ["exenta", "4", "10", "21", "5"]; // "5" se mantiene por compat con compras legacy PY
function ivaRate(t: string): number {
  return rateOf(getPais(), t);
}

const TIPO_DOC_OK = ["factura", "albaran", "ticket", "presupuesto", "rectificativa"];
const ALMACEN_OK = ["deposito", "obra", "vehiculo", "taller"];
function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Construye y valida las líneas de compra. Acepta `items[]` (multiproducto) o,
 * por compat, los campos inline de una compra mono-producto. Recalcula
 * subtotal/IVA/total por línea en el server para evitar drift/tampering.
 */
function parseItems(body: Record<string, unknown>): { items: CompraItemInput[] } | { error: string } {
  const rawList = Array.isArray(body.items) && body.items.length > 0
    ? (body.items as unknown[])
    : [body]; // legacy: una sola línea con los campos inline del body

  const items: CompraItemInput[] = [];
  for (const x of rawList) {
    if (!x || typeof x !== "object") return { error: "Línea de compra inválida." };
    const r = x as Record<string, unknown>;
    const producto_id = String(r.producto_id ?? "").trim();
    if (!producto_id) return { error: "Cada línea debe tener un producto." };
    const cantidad = Number(r.cantidad) || 0;
    if (cantidad <= 0) return { error: "La cantidad de cada línea debe ser mayor a 0." };
    const importeUnitarioRaw = Number(r.costo_unitario) || 0;
    if (importeUnitarioRaw <= 0) return { error: "El coste unitario de cada línea debe ser mayor a 0." };
    const iva_tipo = IVA_OK.includes(String(r.iva_tipo)) ? String(r.iva_tipo) : "21";
    const precioIncluyeIva = r.precio_incluye_iva === true;
    const rate = ivaRate(iva_tipo);
    // Si el importe ingresado incluye IVA, deriva la base unitaria sin IVA antes
    // de persistir, para que el inventario quede valorizado a base imponible.
    const montos = calcularMontos({
      cantidad,
      importeUnitario: importeUnitarioRaw,
      rate,
      precioIncluyeIva,
    });
    const costoUnitarioSinIva = cantidad > 0 ? montos.subtotal / cantidad : 0;
    const costo_unitario_original = Number(r.costo_unitario_original) || costoUnitarioSinIva;
    items.push({
      producto_id,
      producto_nombre: String(r.producto_nombre ?? ""),
      sku: String(r.sku ?? ""),
      cantidad,
      costo_unitario: costoUnitarioSinIva,
      costo_unitario_original,
      iva_tipo,
      subtotal: montos.subtotal,
      monto_iva: montos.iva,
      total_linea: montos.total,
    });
  }
  return { items };
}

/**
 * GET /api/compras — lista via PG directo.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const rows = await listCompras(schema, ctx.auth.empresa_id);
    return NextResponse.json(successResponse({ compras: rows }));
  } catch (err) {
    console.error("[/api/compras GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las compras."), { status: 500 });
  }
}

/**
 * POST /api/compras — crea compra + movimiento ENTRADA + actualiza producto.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const req = (k: string) => body[k] != null && String(body[k]).trim() !== "";

    if (!req("proveedor_id")) return NextResponse.json(errorResponse("Falta el proveedor."), { status: 400 });

    // nro_timbrado / N° de documento: obligatorio solo para factura y factura rectificativa.
    // Para ticket / albaran / presupuesto puede venir vacio: se sustituye por "S/N" antes de
    // insertar para no violar el NOT NULL en DB.
    const TIPOS_DOC_NUM_REQUERIDO = ["factura", "rectificativa"];
    const tipoDocRaw = typeof body.tipo_documento === "string" ? body.tipo_documento : "";
    if (TIPOS_DOC_NUM_REQUERIDO.includes(tipoDocRaw) && !req("nro_timbrado")) {
      return NextResponse.json(errorResponse("Falta el N° de documento del proveedor."), { status: 400 });
    }
    const nroDoc = req("nro_timbrado") ? String(body.nro_timbrado).trim().toUpperCase() : "S/N";

    const parsed = parseItems(body);
    if ("error" in parsed) return NextResponse.json(errorResponse(parsed.error), { status: 400 });
    if (parsed.items.length === 0)
      return NextResponse.json(errorResponse("Agregá al menos una línea de producto."), { status: 400 });

    try {
      const tipoDoc = typeof body.tipo_documento === "string" && TIPO_DOC_OK.includes(body.tipo_documento)
        ? body.tipo_documento : null;
      const fechaCompra = typeof body.fecha_compra === "string" && isIsoDate(body.fecha_compra)
        ? body.fecha_compra : null;
      const fechaVenc = typeof body.fecha_vencimiento === "string" && isIsoDate(body.fecha_vencimiento)
        ? body.fecha_vencimiento : null;
      const almacen = typeof body.almacen_destino === "string" && ALMACEN_OK.includes(body.almacen_destino)
        ? body.almacen_destino : null;
      const proyectoId = typeof body.proyecto_id === "string" && body.proyecto_id.trim() !== ""
        ? body.proyecto_id.trim() : null;

      const out = await insertCompraMultiConImpacto(schema, empresaId, {
        proveedor_id: String(body.proveedor_id),
        proveedor_nombre: String(body.proveedor_nombre ?? ""),
        moneda: body.moneda === "USD" ? "USD" : "PYG",
        tipo_cambio: Number(body.tipo_cambio) || 1,
        tipo_pago: body.tipo_pago === "credito" ? "credito" : "contado",
        plazo_dias: body.plazo_dias != null && String(body.plazo_dias).trim() !== ""
          ? parseInt(String(body.plazo_dias), 10) || null : null,
        nro_timbrado: nroDoc,
        created_by: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: ctx.auth.usuarioNombre ?? ctx.auth.user?.email ?? null,
        items: parsed.items,
        tipo_documento: tipoDoc,
        fecha_compra: fechaCompra,
        fecha_vencimiento: fechaVenc,
        almacen_destino: almacen,
        proyecto_id: proyectoId,
      });

      // Fire-and-forget: genera asiento contable si el motor está sembrado.
      const compraId = (out.compra as { id?: string } | null)?.id;
      if (compraId) asentarBackgroundServer(ctx.supabase, empresaId, "compra", compraId);

      return NextResponse.json(successResponse({
        compra: out.compra,
        movimiento_id: out.movimiento_id,
        warning: out.movimiento_warning,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const code = (e as { code?: string })?.code;
      const detail = (e as { detail?: string })?.detail;
      console.error("[/api/compras POST]", { schema, empresaId, msg, code, detail });
      if (code === "23503") {
        return NextResponse.json(
          errorResponse("Proveedor o producto inválido. Verificá los datos seleccionados."),
          { status: 400 }
        );
      }
      if (code === "23505") {
        return NextResponse.json(
          errorResponse("Conflicto al generar el número de control. Reintentá."),
          { status: 409 }
        );
      }
      if (code === "23514") {
        // CHECK constraint violation — devolver el detalle para diagnosticar
        // (ej: iva_tipo viejo solo aceptaba 'exenta'/'5'/'10', tipo_documento
        // sin valor permitido, etc).
        return NextResponse.json(
          errorResponse(`Restricción de la base no aceptó el valor: ${detail || msg || "ver logs"}`),
          { status: 400 }
        );
      }
      if (code === "42703") {
        // undefined_column: la migración no se corrió o falta una columna.
        return NextResponse.json(
          errorResponse(`Columna inexistente en compras: ${msg}. ¿Corriste el ALTER TABLE?`),
          { status: 500 }
        );
      }
      // Modo diagnostico: incluir code+msg para que el usuario nos pase el error real.
      const diag = [code, msg].filter(Boolean).join(" — ");
      return NextResponse.json(
        errorResponse(`No se pudo guardar la compra. ${diag || "Revisá los datos e intentá nuevamente."}`),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/compras POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar la compra."), { status: 500 });
  }
}
