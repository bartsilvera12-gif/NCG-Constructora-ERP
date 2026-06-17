import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/inventario/movimientos/salida
 *
 * Registra una salida de stock con motivo (uso_obra, rotura, etc.) en una
 * sola operación server-side: valida → descuenta stock → inserta movimiento.
 * Usado por inventario/movimientos/nuevo cuando hay motivo, y por Control
 * de obra (al imputar material a una obra).
 */
const MOTIVOS_VALIDOS = new Set([
  "uso_obra",
  "consumo_interno",
  "rotura",
  "ajuste",
  "entrega_cuadrilla",
  "transferencia_vehiculo",
]);

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const producto_id = String(body.producto_id ?? "").trim();
    const cantidad = Number(body.cantidad);
    const motivo = String(body.motivo ?? "").trim();
    const proyecto_id_raw = body.proyecto_id == null || body.proyecto_id === ""
      ? null
      : String(body.proyecto_id).trim();
    const responsableRaw = typeof body.responsable === "string" ? body.responsable.trim() : "";
    const ubicacion_origen = typeof body.ubicacion_origen === "string" && body.ubicacion_origen.trim() !== ""
      ? body.ubicacion_origen.trim()
      : null;
    const observacion = typeof body.observacion === "string" && body.observacion.trim() !== ""
      ? body.observacion.trim()
      : null;
    const fechaIso = typeof body.fecha === "string" && body.fecha.trim() !== ""
      ? new Date(body.fecha).toISOString()
      : new Date().toISOString();

    if (!producto_id) return NextResponse.json(errorResponse("Falta el producto."), { status: 400 });
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return NextResponse.json(errorResponse("La cantidad debe ser mayor a 0."), { status: 400 });
    }
    if (!MOTIVOS_VALIDOS.has(motivo)) {
      return NextResponse.json(errorResponse("Motivo de salida inválido."), { status: 400 });
    }
    if (motivo === "uso_obra" && !proyecto_id_raw) {
      return NextResponse.json(errorResponse("Seleccioná una obra para registrar el consumo."), { status: 400 });
    }

    const { data: prod, error: prodErr } = await ctx.supabase
      .from("productos")
      .select("id, nombre, sku, stock_actual, costo_promedio, controla_stock, tipo_inventario")
      .eq("id", producto_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (prodErr) return NextResponse.json(errorResponse(prodErr.message), { status: 400 });
    if (!prod) return NextResponse.json(errorResponse("Producto no encontrado."), { status: 404 });

    const stockActual = Number(prod.stock_actual ?? 0);
    const controla = (prod as { controla_stock?: boolean }).controla_stock !== false;
    if (controla && cantidad > stockActual) {
      return NextResponse.json(
        errorResponse(`No hay stock suficiente para realizar la salida. Disponible: ${stockActual}.`),
        { status: 400 }
      );
    }

    const costoUnitario = Number(prod.costo_promedio ?? 0);
    const usuarioNombre =
      responsableRaw ||
      ctx.auth.usuarioNombre ||
      ctx.auth.user?.email ||
      null;

    const { data: movRow, error: movErr } = await ctx.supabase
      .from("movimientos_inventario")
      .insert([{
        empresa_id: empresaId,
        producto_id: prod.id,
        producto_nombre: (prod as { nombre: string }).nombre,
        producto_sku: (prod as { sku?: string | null }).sku ?? "",
        tipo: "SALIDA",
        cantidad,
        costo_unitario: costoUnitario,
        origen: "ajuste_manual",
        referencia: ubicacion_origen,
        fecha: fechaIso,
        created_by: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: usuarioNombre,
        proyecto_id: motivo === "uso_obra" ? proyecto_id_raw : (proyecto_id_raw || null),
        motivo,
        observacion,
      }])
      .select("id, fecha, cantidad, costo_unitario, motivo, proyecto_id")
      .single();
    if (movErr) {
      return NextResponse.json(errorResponse(`No se pudo registrar el movimiento: ${movErr.message}`), { status: 400 });
    }

    if (controla) {
      const nuevoStock = Math.max(0, stockActual - cantidad);
      const { error: stockErr } = await ctx.supabase
        .from("productos")
        .update({ stock_actual: nuevoStock })
        .eq("id", producto_id)
        .eq("empresa_id", empresaId);
      if (stockErr) {
        console.error("[/api/inventario/movimientos/salida] update stock", stockErr.message);
        return NextResponse.json(
          successResponse({ movimiento: movRow, warning: "Movimiento registrado pero el stock no se pudo actualizar." })
        );
      }
    }

    return NextResponse.json(successResponse({
      movimiento: movRow,
      costo_total: cantidad * costoUnitario,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[/api/inventario/movimientos/salida]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
