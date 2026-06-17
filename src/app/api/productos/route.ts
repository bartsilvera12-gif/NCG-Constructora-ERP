import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { normalizeUpperText } from "@/lib/text/normalize";
import { signProductoImagen } from "@/lib/inventario/imagen-storage";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * GET/POST de productos via PostgREST (sin pool PG directo) — compatible Hostinger.
 */

const PRODUCTO_COLS =
  "id, empresa_id, nombre, sku, costo_promedio, ultimo_costo, cantidad_asignada, cantidad_mantenimiento, precio_venta, precio_minorista, precio_mayorista, stock_actual, stock_minimo, " +
  "unidad_medida, metodo_valuacion, activo, created_at, updated_at, " +
  "codigo_barras, codigo_interno, codigo_barras_interno, imagen_path, imagen_url, " +
  "categoria_principal_id, ubicacion_principal_id, proveedor_principal_id, " +
  "es_vendible, es_insumo, controla_stock, valorizado, unidad_compra, unidad_receta, " +
  "factor_compra_receta, tiempo_prep_minutos, descripcion, tipo_inventario";

function toNumber(v: unknown): unknown {
  return typeof v === "string" ? Number(v) : v;
}
function rowToApi(r: Record<string, unknown>): Record<string, unknown> {
  return {
    ...r,
    costo_promedio: toNumber(r.costo_promedio),
    ultimo_costo: toNumber(r.ultimo_costo),
    precio_venta: toNumber(r.precio_venta),
    precio_minorista: toNumber(r.precio_minorista),
    precio_mayorista: toNumber(r.precio_mayorista),
    stock_actual: toNumber(r.stock_actual),
    stock_minimo: toNumber(r.stock_minimo),
    factor_compra_receta: toNumber(r.factor_compra_receta),
  };
}

async function existsId(
  sb: AppSupabaseClient,
  table: "categorias_productos" | "inventario_ubicaciones" | "proveedores",
  empresaId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await sb
    .from(table)
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("productos")
      .select(PRODUCTO_COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("activo", true)
      .order("nombre");
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToApi);

    // Generar signed URLs en batch para los productos que tienen imagen_path.
    // El sistema deja imagen_url en null en BD (ver /imagen POST línea ~128) y
    // genera URLs firmadas on-demand. Acá las generamos en paralelo así la
    // lista del frontend ya recibe las URLs listas para renderizar el thumbnail.
    // TTL 3600s (1h) — la página de inventario se refresca con suficiente
    // frecuencia como para que no caduque en uso normal.
    const conImagen = rows.filter((r) => typeof r.imagen_path === "string" && r.imagen_path);
    if (conImagen.length > 0) {
      const signed = await Promise.all(
        conImagen.map(async (r) => {
          try {
            const url = await signProductoImagen(ctx.supabase, String(r.imagen_path), 3600);
            return { id: r.id, url };
          } catch {
            return { id: r.id, url: null };
          }
        })
      );
      const byId = new Map(signed.map((s) => [s.id, s.url]));
      for (const r of rows) {
        if (byId.has(r.id)) {
          r.imagen_url = byId.get(r.id);
        }
      }
    }

    return NextResponse.json(successResponse({ productos: rows }));
  } catch (err) {
    console.error("[/api/productos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los productos."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const nombre = normalizeUpperText(body.nombre);
    const sku = normalizeUpperText(body.sku);
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    if (!sku) return NextResponse.json(errorResponse("El SKU es obligatorio."), { status: 400 });

    // Código de barras = NUMÉRICO escaneable (EAN-13 recomendado). Se rechaza
    // cualquier no-dígito para no volver a contaminarlo con códigos internos.
    const codigoBarrasRaw = String(body.codigo_barras ?? "").replace(/\s+/g, "");
    if (codigoBarrasRaw && !/^\d+$/.test(codigoBarrasRaw)) {
      return NextResponse.json(
        errorResponse("El código de barras debe ser numérico (escaneable). El código interno va en su propio campo."),
        { status: 400 }
      );
    }
    const codigoBarras = codigoBarrasRaw || null;
    // Código interno / ERP (alfanumérico, ej. INT-DIS-…). Campo separado.
    const codigoInterno = String(body.codigo_interno ?? "").trim().toUpperCase() || null;
    const stockActual = Number(body.stock_actual ?? 0) || 0;
    const costoPromedio = Number(body.costo_promedio ?? 0) || 0;
    // Si no viene ultimo_costo, arranca igual al costo promedio (compras posteriores lo actualizan).
    const ultimoCosto = body.ultimo_costo != null && body.ultimo_costo !== ""
      ? Number(body.ultimo_costo) || 0
      : costoPromedio;
    const stockMinimo = Number(body.stock_minimo ?? 0) || 0;
    const tipoInventario =
      body.tipo_inventario === "herramienta"
        ? (body.tipo_inventario as string)
        : "material";
    // Precios: minorista es el precio principal. Fallback a precio_venta para
    // compatibilidad si el cliente no envía minorista. Mayorista cae a minorista.
    const precioVentaBody = Number(body.precio_venta ?? 0) || 0;
    const precioMinorista =
      body.precio_minorista != null && Number(body.precio_minorista) >= 0
        ? Number(body.precio_minorista) || 0
        : precioVentaBody;
    const precioMayorista =
      body.precio_mayorista != null && Number(body.precio_mayorista) > 0
        ? Number(body.precio_mayorista)
        : precioMinorista;
    // precio_venta SIEMPRE espejo de minorista (compatibilidad legacy).
    const precioVenta = precioMinorista;
    const unidadMedida = normalizeUpperText(body.unidad_medida) || "UNIDAD";
    const metodoValuacion =
      body.metodo_valuacion === "FIFO" || body.metodo_valuacion === "LIFO"
        ? (body.metodo_valuacion as "FIFO" | "LIFO")
        : "CPP";

    const categoriaPrincipalId = body.categoria_principal_id ? String(body.categoria_principal_id) : null;
    const ubicacionPrincipalId = body.ubicacion_principal_id ? String(body.ubicacion_principal_id) : null;
    const proveedorPrincipalId = body.proveedor_principal_id ? String(body.proveedor_principal_id) : null;

    const esVendible = typeof body.es_vendible === "boolean" ? body.es_vendible : undefined;
    const esInsumo = typeof body.es_insumo === "boolean" ? body.es_insumo : undefined;
    const controlaStock = typeof body.controla_stock === "boolean" ? body.controla_stock : undefined;
    const valorizado = typeof body.valorizado === "boolean" ? body.valorizado : undefined;
    const unidadCompra =
      typeof body.unidad_compra === "string"
        ? body.unidad_compra.trim() || null
        : body.unidad_compra === null
        ? null
        : undefined;
    const unidadReceta =
      typeof body.unidad_receta === "string"
        ? body.unidad_receta.trim() || null
        : body.unidad_receta === null
        ? null
        : undefined;
    const factorCompraReceta =
      typeof body.factor_compra_receta === "number" && body.factor_compra_receta > 0
        ? body.factor_compra_receta
        : undefined;
    const tiempoPrepMinutos =
      typeof body.tiempo_prep_minutos === "number" && body.tiempo_prep_minutos >= 0
        ? Math.floor(body.tiempo_prep_minutos)
        : undefined;

    // Validar ownership de relaciones opcionales
    if (categoriaPrincipalId && !(await existsId(sb, "categorias_productos", empresaId, categoriaPrincipalId))) {
      return NextResponse.json(errorResponse("La categoría seleccionada no existe."), { status: 400 });
    }
    if (ubicacionPrincipalId && !(await existsId(sb, "inventario_ubicaciones", empresaId, ubicacionPrincipalId))) {
      return NextResponse.json(errorResponse("La ubicación seleccionada no existe."), { status: 400 });
    }
    if (proveedorPrincipalId && !(await existsId(sb, "proveedores", empresaId, proveedorPrincipalId))) {
      return NextResponse.json(errorResponse("El proveedor seleccionado no existe."), { status: 400 });
    }

    // Insert principal
    const insertPayload: Record<string, unknown> = {
      empresa_id: empresaId,
      nombre,
      sku,
      costo_promedio: costoPromedio,
      ultimo_costo: ultimoCosto,
      precio_minorista: precioMinorista,
      precio_mayorista: precioMayorista,
      precio_venta: precioVenta,
      stock_actual: stockActual,
      stock_minimo: stockMinimo,
      unidad_medida: unidadMedida,
      metodo_valuacion: metodoValuacion,
      codigo_barras: codigoBarras,
      codigo_interno: codigoInterno,
      codigo_barras_interno: false,
      categoria_principal_id: categoriaPrincipalId,
      ubicacion_principal_id: ubicacionPrincipalId,
      proveedor_principal_id: proveedorPrincipalId,
      tipo_inventario: tipoInventario,
    };
    if (esVendible !== undefined) insertPayload.es_vendible = esVendible;
    if (esInsumo !== undefined) insertPayload.es_insumo = esInsumo;
    if (controlaStock !== undefined) insertPayload.controla_stock = controlaStock;
    if (valorizado !== undefined) insertPayload.valorizado = valorizado;
    if (unidadCompra !== undefined) insertPayload.unidad_compra = unidadCompra;
    if (unidadReceta !== undefined) insertPayload.unidad_receta = unidadReceta;
    if (factorCompraReceta !== undefined) insertPayload.factor_compra_receta = factorCompraReceta;
    if (tiempoPrepMinutos !== undefined) insertPayload.tiempo_prep_minutos = tiempoPrepMinutos;
    const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() || null : (body.descripcion === null ? null : undefined);
    if (descripcion !== undefined) insertPayload.descripcion = descripcion;

    const ins = await sb.from("productos").insert(insertPayload).select(PRODUCTO_COLS).single();
    if (ins.error) {
      const msg = ins.error.message ?? "";
      if (/duplicate key|unique|23505/i.test(msg)) {
        if (/sku/i.test(msg)) {
          return NextResponse.json(errorResponse("Ya existe un producto con ese SKU."), { status: 409 });
        }
        if (/codigo_barras|barras/i.test(msg)) {
          return NextResponse.json(errorResponse("Ya existe un producto con ese código de barras."), {
            status: 409,
          });
        }
        return NextResponse.json(errorResponse("Ya existe un producto con datos únicos en conflicto."), {
          status: 409,
        });
      }
      console.error("[/api/productos POST] insert", msg);
      return NextResponse.json(errorResponse("No se pudo guardar el producto."), { status: 500 });
    }
    const row = ins.data as unknown as Record<string, unknown>;
    const productoId = String(row.id);

    // Movimiento de inventario inicial — solo si controla_stock=true Y stock>0
    let movWarning: string | null = null;
    const controlaStockFinal = row.controla_stock !== false;
    if (stockActual > 0 && controlaStockFinal) {
      const movIns = await sb.from("movimientos_inventario").insert({
        empresa_id: empresaId,
        producto_id: productoId,
        producto_nombre: nombre,
        producto_sku: sku,
        tipo: "ENTRADA",
        cantidad: stockActual,
        costo_unitario: costoPromedio,
        origen: "inventario_inicial",
        referencia: null,
        // Atribución del movimiento (columna "Usuario" en Movimientos).
        created_by: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: ctx.auth.usuarioNombre ?? ctx.auth.user?.email ?? null,
      });
      if (movIns.error) {
        console.error("[/api/productos POST] inventario_inicial", movIns.error.message);
        movWarning = "El producto se guardó pero no se pudo registrar el movimiento inicial de stock.";
      }
    }

    // Categoría principal: insertar en puente producto_categorias
    if (categoriaPrincipalId) {
      const pc = await sb.from("producto_categorias").insert({
        empresa_id: empresaId,
        producto_id: productoId,
        categoria_id: categoriaPrincipalId,
        es_principal: true,
      });
      if (pc.error) {
        console.error("[/api/productos POST] producto_categorias", pc.error.message);
      }
    }

    // Stock por ubicación (solo si aplica)
    if (ubicacionPrincipalId && stockActual > 0 && controlaStockFinal) {
      const su = await sb.from("inventario_stock_ubicacion").insert({
        empresa_id: empresaId,
        producto_id: productoId,
        ubicacion_id: ubicacionPrincipalId,
        stock_actual: stockActual,
        es_principal: true,
      });
      if (su.error) {
        console.error("[/api/productos POST] inventario_stock_ubicacion", su.error.message);
      }
    }

    return NextResponse.json(successResponse({ producto: rowToApi(row), warning: movWarning }));
  } catch (err) {
    console.error("[/api/productos POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse("No se pudo guardar el producto. Revisá los datos e intentá nuevamente."),
      { status: 500 }
    );
  }
}
