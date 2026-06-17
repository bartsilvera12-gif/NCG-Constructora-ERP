import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { normalizeUpperText } from "@/lib/text/normalize";
import {
  HERRAMIENTA_COLS,
  parseHerramientaPayload,
} from "@/lib/inventario/herramienta-payload";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

const PRODUCTO_COLS =
  "id, empresa_id, nombre, sku, costo_promedio, ultimo_costo, cantidad_asignada, cantidad_mantenimiento, precio_venta, precio_minorista, precio_mayorista, stock_actual, stock_minimo, " +
  "unidad_medida, metodo_valuacion, activo, created_at, updated_at, " +
  "codigo_barras, codigo_interno, codigo_barras_interno, imagen_path, imagen_url, " +
  "categoria_principal_id, ubicacion_principal_id, proveedor_principal_id, " +
  "es_vendible, es_insumo, controla_stock, valorizado, unidad_compra, unidad_receta, " +
  "factor_compra_receta, tiempo_prep_minutos, descripcion, tipo_inventario, estado_herramienta, " +
  HERRAMIENTA_COLS;

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

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("productos")
      .select(PRODUCTO_COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ producto: rowToApi(data as unknown as Record<string, unknown>) }));
  } catch (err) {
    console.error("[/api/productos/[id] GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el producto."), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
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

    const patch: Record<string, unknown> = {};
    if (body.nombre !== undefined) patch.nombre = normalizeUpperText(body.nombre);
    if (body.sku !== undefined) patch.sku = normalizeUpperText(body.sku);
    if (body.costo_promedio !== undefined) patch.costo_promedio = Number(body.costo_promedio) || 0;
    if (body.ultimo_costo !== undefined) patch.ultimo_costo = Number(body.ultimo_costo) || 0;
    // Minorista es el precio principal; precio_venta queda SIEMPRE como su espejo.
    if (body.precio_minorista !== undefined) {
      const min = Number(body.precio_minorista) || 0;
      patch.precio_minorista = min;
      patch.precio_venta = min;
    }
    if (body.precio_mayorista !== undefined) patch.precio_mayorista = Number(body.precio_mayorista) || 0;
    // precio_venta directo solo si no vino minorista (compatibilidad legacy).
    if (body.precio_venta !== undefined && body.precio_minorista === undefined) {
      patch.precio_venta = Number(body.precio_venta) || 0;
    }
    if (body.stock_actual !== undefined) patch.stock_actual = Number(body.stock_actual) || 0;
    if (body.stock_minimo !== undefined) patch.stock_minimo = Number(body.stock_minimo) || 0;
    if (body.unidad_medida !== undefined) patch.unidad_medida = normalizeUpperText(body.unidad_medida) || "UNIDAD";
    if (body.metodo_valuacion !== undefined) {
      const mv = body.metodo_valuacion;
      patch.metodo_valuacion = mv === "FIFO" || mv === "LIFO" ? mv : "CPP";
    }
    if (body.codigo_barras !== undefined) {
      const cbRaw = String(body.codigo_barras ?? "").replace(/\s+/g, "");
      if (cbRaw && !/^\d+$/.test(cbRaw)) {
        return NextResponse.json(
          errorResponse("El código de barras debe ser numérico (escaneable). El código interno va en su propio campo."),
          { status: 400 }
        );
      }
      patch.codigo_barras = cbRaw || null;
    }
    if (body.codigo_interno !== undefined) {
      patch.codigo_interno = String(body.codigo_interno ?? "").trim().toUpperCase() || null;
    }
    if (body.codigo_barras_interno !== undefined) patch.codigo_barras_interno = body.codigo_barras_interno === true;
    if (body.imagen_path !== undefined) {
      const v = body.imagen_path != null ? String(body.imagen_path) : "";
      patch.imagen_path = v || null;
    }
    if (body.imagen_url !== undefined) {
      const v = body.imagen_url != null ? String(body.imagen_url) : "";
      patch.imagen_url = v || null;
    }

    let categoriaCambia = false;
    let categoriaNueva: string | null = null;
    if (body.categoria_principal_id !== undefined) {
      const v = body.categoria_principal_id == null ? null : String(body.categoria_principal_id);
      if (v && !(await existsId(sb, "categorias_productos", empresaId, v))) {
        return NextResponse.json(errorResponse("La categoría seleccionada no existe."), { status: 400 });
      }
      patch.categoria_principal_id = v;
      categoriaCambia = true;
      categoriaNueva = v;
    }
    if (body.ubicacion_principal_id !== undefined) {
      const v = body.ubicacion_principal_id == null ? null : String(body.ubicacion_principal_id);
      if (v && !(await existsId(sb, "inventario_ubicaciones", empresaId, v))) {
        return NextResponse.json(errorResponse("La ubicación seleccionada no existe."), { status: 400 });
      }
      patch.ubicacion_principal_id = v;
    }
    if (body.proveedor_principal_id !== undefined) {
      const v = body.proveedor_principal_id == null ? null : String(body.proveedor_principal_id);
      if (v && !(await existsId(sb, "proveedores", empresaId, v))) {
        return NextResponse.json(errorResponse("El proveedor seleccionado no existe."), { status: 400 });
      }
      patch.proveedor_principal_id = v;
    }
    if (typeof body.es_vendible === "boolean") patch.es_vendible = body.es_vendible;
    if (typeof body.es_insumo === "boolean") patch.es_insumo = body.es_insumo;
    if (typeof body.controla_stock === "boolean") patch.controla_stock = body.controla_stock;
    if (typeof body.valorizado === "boolean") patch.valorizado = body.valorizado;
    if (body.unidad_compra !== undefined)
      patch.unidad_compra = body.unidad_compra == null ? null : String(body.unidad_compra).trim() || null;
    if (body.unidad_receta !== undefined)
      patch.unidad_receta = body.unidad_receta == null ? null : String(body.unidad_receta).trim() || null;
    if (typeof body.factor_compra_receta === "number" && body.factor_compra_receta > 0)
      patch.factor_compra_receta = body.factor_compra_receta;
    if (typeof body.tiempo_prep_minutos === "number" && body.tiempo_prep_minutos >= 0)
      patch.tiempo_prep_minutos = Math.floor(body.tiempo_prep_minutos);
    if (body.descripcion !== undefined)
      patch.descripcion = body.descripcion == null ? null : String(body.descripcion).trim() || null;
    if (body.tipo_inventario === "herramienta" || body.tipo_inventario === "material") {
      patch.tipo_inventario = body.tipo_inventario;
    }
    // Si pasa a 'material', limpiar TODOS los campos específicos de herramienta
    // (incluyendo legacy estado_herramienta) para no dejar huérfanos.
    if (patch.tipo_inventario === "material") {
      patch.estado_herramienta = null;
      patch.condicion_alta = null;
      patch.estado_operativo = null;
      patch.fecha_compra = null;
      patch.proveedor_id = null;
      patch.proveedor_nombre = null;
      patch.costo_adquisicion = null;
      patch.numero_comprobante = null;
      patch.garantia = null;
      patch.garantia_fin = null;
      patch.vida_util_estimada_meses = null;
      patch.vida_util_restante_meses = null;
      patch.procedencia = null;
      patch.condicion_actual = null;
      patch.requiere_mantenimiento_inicial = null;
      patch.fecha_reacondicionamiento = null;
      patch.costo_reacondicionamiento = null;
      patch.herramienta_observacion = null;
    } else {
      // legacy estado_herramienta: solo se acepta si el cliente lo envía
      // explícitamente. Las UIs nuevas no lo mandan; el espejo lo recalcula
      // el helper a partir de condicion_alta.
      if (body.estado_herramienta === "usada" || body.estado_herramienta === "nueva") {
        patch.estado_herramienta = body.estado_herramienta;
      }
      // Cualquier campo de herramienta que venga, pasarlo por el parser.
      const HER_KEYS = [
        "condicion_alta",
        "estado_operativo",
        "fecha_compra",
        "proveedor_id",
        "proveedor_nombre",
        "costo_adquisicion",
        "numero_comprobante",
        "garantia",
        "garantia_fin",
        "vida_util_estimada_meses",
        "vida_util_restante_meses",
        "procedencia",
        "condicion_actual",
        "requiere_mantenimiento_inicial",
        "fecha_reacondicionamiento",
        "costo_reacondicionamiento",
        "herramienta_observacion",
      ] as const;
      const tieneAlgunoHerramienta = HER_KEYS.some((k) => k in body);
      if (tieneAlgunoHerramienta) {
        const r = parseHerramientaPayload(body);
        if (!r.ok) return NextResponse.json(errorResponse(r.error), { status: 400 });
        for (const k of HER_KEYS) {
          if (k in body) {
            (patch as Record<string, unknown>)[k] = (r.fields as Record<string, unknown>)[k];
          }
        }
        // Si cambió la condición y vino una nueva, mantener el espejo legacy
        // sincronizado.
        if ("condicion_alta" in body) {
          const c = r.fields.condicion_alta;
          patch.estado_herramienta = c === "nueva" ? "nueva" : c == null ? null : "usada";
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      const { data: existing, error: errGet } = await sb
        .from("productos")
        .select(PRODUCTO_COLS)
        .eq("empresa_id", empresaId)
        .eq("id", id)
        .maybeSingle();
      if (errGet) throw new Error(errGet.message);
      if (!existing) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
      return NextResponse.json(successResponse({ producto: rowToApi(existing as unknown as Record<string, unknown>) }));
    }

    const upd = await sb
      .from("productos")
      .update(patch)
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .select(PRODUCTO_COLS)
      .maybeSingle();
    if (upd.error) {
      const msg = upd.error.message ?? "";
      if (/duplicate key|unique|23505/i.test(msg)) {
        if (/sku/i.test(msg)) return NextResponse.json(errorResponse("Ya existe un producto con ese SKU."), { status: 409 });
        if (/codigo_barras|barras/i.test(msg))
          return NextResponse.json(errorResponse("Ya existe un producto con ese código de barras."), { status: 409 });
        return NextResponse.json(errorResponse("Conflicto de datos únicos."), { status: 409 });
      }
      console.error("[/api/productos/[id] PATCH]", msg);
      return NextResponse.json(errorResponse("No se pudo actualizar el producto."), { status: 500 });
    }
    if (!upd.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const updRow = upd.data as unknown as Record<string, unknown>;

    // Sincronizar categoría principal en puente producto_categorias
    if (categoriaCambia) {
      try {
        // Limpiar es_principal anterior
        await sb
          .from("producto_categorias")
          .update({ es_principal: false })
          .eq("empresa_id", empresaId)
          .eq("producto_id", id)
          .eq("es_principal", true);
        if (categoriaNueva) {
          // Upsert manual: chequear si existe, sino insertar
          const { data: existing } = await sb
            .from("producto_categorias")
            .select("id")
            .eq("empresa_id", empresaId)
            .eq("producto_id", id)
            .eq("categoria_id", categoriaNueva)
            .limit(1);
          if ((existing ?? []).length > 0) {
            await sb
              .from("producto_categorias")
              .update({ es_principal: true })
              .eq("empresa_id", empresaId)
              .eq("producto_id", id)
              .eq("categoria_id", categoriaNueva);
          } else {
            await sb.from("producto_categorias").insert({
              empresa_id: empresaId,
              producto_id: id,
              categoria_id: categoriaNueva,
              es_principal: true,
            });
          }
        }
      } catch (err) {
        console.error("[/api/productos/[id] PATCH] sync producto_categorias", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json(successResponse({ producto: rowToApi(updRow) }));
  } catch (err) {
    console.error("[/api/productos/[id] PATCH] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar el producto."), { status: 500 });
  }
}

/**
 * DELETE /api/productos/[id]
 *
 * Por defecto hace **soft delete** (set `activo = false`). Esto preserva la
 * integridad de movimientos / ventas históricas que referencian al producto.
 *
 * Si se pasa `?hard=1` en la query, intenta hard delete:
 *   - Falla con 409 si hay FKs (ventas, movimientos, recetas, etc.).
 *   - El frontend cae al soft delete si recibe 409.
 */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    const url = new URL(request.url);
    const hard = url.searchParams.get("hard") === "1";

    // Verificar que existe y pertenece a la empresa.
    const { data: existing, error: errGet } = await sb
      .from("productos")
      .select("id, nombre, activo")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .maybeSingle();
    if (errGet) throw new Error(errGet.message);
    if (!existing) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    if (hard) {
      // Intento de hard delete — puede fallar por FKs (ventas/movimientos).
      const del = await sb
        .from("productos")
        .delete()
        .eq("empresa_id", empresaId)
        .eq("id", id);
      if (del.error) {
        const msg = del.error.message ?? "";
        if (/foreign key|fk|23503/i.test(msg)) {
          return NextResponse.json(
            errorResponse(
              "El producto tiene movimientos o ventas asociadas. Probá desactivarlo (soft delete) en vez de eliminarlo."
            ),
            { status: 409 }
          );
        }
        console.error("[/api/productos/[id] DELETE hard]", msg);
        return NextResponse.json(errorResponse("No se pudo eliminar el producto."), { status: 500 });
      }
      return NextResponse.json(successResponse({ deleted: true, hard: true, id }));
    }

    // Soft delete (default): activo = false.
    const upd = await sb
      .from("productos")
      .update({ activo: false })
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .select("id, nombre, activo")
      .maybeSingle();
    if (upd.error) {
      console.error("[/api/productos/[id] DELETE soft]", upd.error.message);
      return NextResponse.json(errorResponse("No se pudo desactivar el producto."), { status: 500 });
    }
    return NextResponse.json(successResponse({ deleted: true, hard: false, id, producto: upd.data }));
  } catch (err) {
    console.error("[/api/productos/[id] DELETE] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo eliminar el producto."), { status: 500 });
  }
}
