import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/proyectos/[id]/materiales
 *
 * Materiales de la obra: estimados (snapshot del presupuesto en brief_data)
 * vs usados reales (movimientos_inventario SALIDA con proyecto_id).
 *
 * Respuesta:
 *   {
 *     estimados: [{ producto_id, producto_nombre, sku, cantidad, precio_unitario, total_linea }],
 *     usados:    [{ producto_id, producto_nombre, sku, cantidad, costo_unitario, costo_total }],
 *     combinado: [{ producto_id, producto_nombre, sku, est_cantidad, usado_cantidad,
 *                   diferencia, est_total, usado_total }]
 *   }
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(_request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });
    const empresaId = ctx.auth.empresa_id;

    // 1) Estimados desde brief_data del proyecto.
    const { data: proy, error: e1 } = await ctx.supabase
      .from("proyectos")
      .select("id, brief_data")
      .eq("id", id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (e1) return NextResponse.json(errorResponse(e1.message), { status: 400 });
    if (!proy) return NextResponse.json(errorResponse("Obra no encontrada"), { status: 404 });
    const brief = ((proy as { brief_data?: unknown }).brief_data ?? {}) as Record<string, unknown>;
    const partidas = Array.isArray(brief.materiales_estimados)
      ? (brief.materiales_estimados as unknown[])
      : Array.isArray(brief.items)
        ? (brief.items as unknown[]).filter((x) => {
            const it = x as { tipo_partida?: string };
            return (it.tipo_partida ?? "producto") === "producto";
          })
        : [];
    const estimados = partidas.map((raw) => {
      const p = raw as Record<string, unknown>;
      return {
        producto_id: typeof p.producto_id === "string" ? p.producto_id : null,
        producto_nombre: typeof p.producto_nombre === "string"
          ? p.producto_nombre
          : (typeof p.descripcion === "string" ? p.descripcion : ""),
        sku: typeof p.sku === "string" ? p.sku : "",
        cantidad: Number(p.cantidad) || 0,
        precio_unitario: Number(p.precio_unitario ?? p.precio_venta) || 0,
        total_linea: Number(p.total_linea ?? p.subtotal) || 0,
      };
    });

    // 2) Usados reales: movimientos SALIDA imputados a esta obra.
    const { data: movsRaw, error: e2 } = await ctx.supabase
      .from("movimientos_inventario")
      .select("producto_id, producto_nombre, producto_sku, cantidad, costo_unitario, fecha, motivo, observacion")
      .eq("empresa_id", empresaId)
      .eq("proyecto_id", id)
      .eq("tipo", "SALIDA")
      .order("fecha", { ascending: false });
    if (e2) return NextResponse.json(errorResponse(e2.message), { status: 400 });
    const usados = ((movsRaw ?? []) as Array<{
      producto_id: string | null;
      producto_nombre: string | null;
      producto_sku: string | null;
      cantidad: number | string;
      costo_unitario: number | string;
      fecha: string;
      motivo: string | null;
      observacion: string | null;
    }>).map((m) => ({
      producto_id: m.producto_id,
      producto_nombre: m.producto_nombre ?? "",
      sku: m.producto_sku ?? "",
      cantidad: Number(m.cantidad) || 0,
      costo_unitario: Number(m.costo_unitario) || 0,
      costo_total: (Number(m.cantidad) || 0) * (Number(m.costo_unitario) || 0),
      fecha: m.fecha,
      motivo: m.motivo,
      observacion: m.observacion,
    }));

    // 3) Combinado: estimado vs usado por producto_id (o por nombre si no hay id).
    const byKey = new Map<string, {
      key: string;
      producto_id: string | null;
      producto_nombre: string;
      sku: string;
      est_cantidad: number;
      usado_cantidad: number;
      est_total: number;
      usado_total: number;
    }>();
    const keyOf = (p: { producto_id: string | null; producto_nombre: string }) =>
      p.producto_id ? `id:${p.producto_id}` : `nom:${p.producto_nombre.toLowerCase()}`;
    for (const e of estimados) {
      const k = keyOf(e);
      const cur = byKey.get(k) ?? {
        key: k, producto_id: e.producto_id, producto_nombre: e.producto_nombre, sku: e.sku,
        est_cantidad: 0, usado_cantidad: 0, est_total: 0, usado_total: 0,
      };
      cur.est_cantidad += e.cantidad;
      cur.est_total += e.total_linea;
      byKey.set(k, cur);
    }
    for (const u of usados) {
      const k = keyOf(u);
      const cur = byKey.get(k) ?? {
        key: k, producto_id: u.producto_id, producto_nombre: u.producto_nombre, sku: u.sku,
        est_cantidad: 0, usado_cantidad: 0, est_total: 0, usado_total: 0,
      };
      cur.usado_cantidad += u.cantidad;
      cur.usado_total += u.costo_total;
      byKey.set(k, cur);
    }
    const combinado = Array.from(byKey.values())
      .map((c) => ({
        ...c,
        diferencia: c.usado_cantidad - c.est_cantidad,
      }))
      .sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));

    const totals = {
      estimado_total: estimados.reduce((s, x) => s + x.total_linea, 0),
      usado_total: usados.reduce((s, x) => s + x.costo_total, 0),
    };

    return NextResponse.json(successResponse({ estimados, usados, combinado, totales: totals }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
