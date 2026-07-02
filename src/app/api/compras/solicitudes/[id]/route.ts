import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const ESTADOS = ["borrador","autorizado","comprado","facturado","cancelado"] as const;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numn = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;

    const [cabQ, itemsQ] = await Promise.all([
      ctx.supabase.from("solicitudes_compra").select("*")
        .eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle(),
      ctx.supabase.from("solicitudes_compra_items").select("*")
        .eq("empresa_id", ctx.auth.empresa_id).eq("solicitud_id", id)
        .order("orden", { ascending: true }),
    ]);
    if (cabQ.error) return NextResponse.json(errorResponse(cabQ.error.message), { status: 400 });
    if (!cabQ.data) return NextResponse.json(errorResponse("Solicitud no encontrada"), { status: 404 });
    if (itemsQ.error) return NextResponse.json(errorResponse(itemsQ.error.message), { status: 400 });

    return NextResponse.json(successResponse({ solicitud: cabQ.data, items: itemsQ.data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** PUT — reemplaza cabecera + items (delete + insert). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
    const totalEstimado = items.reduce((acc, it) => acc + num(it.cantidad) * num(it.precio_estimado), 0);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString(), total_estimado: totalEstimado };
    if (body.fecha !== undefined) update.fecha = String(body.fecha);
    if (body.proyecto_id !== undefined) update.proyecto_id = body.proyecto_id ? String(body.proyecto_id) : null;
    if (body.empleado_id !== undefined) update.empleado_id = body.empleado_id ? String(body.empleado_id) : null;
    if (body.proveedor_nombre !== undefined) update.proveedor_nombre_snapshot = body.proveedor_nombre ? String(body.proveedor_nombre) : null;
    if (body.observaciones !== undefined) update.observaciones = body.observaciones ? String(body.observaciones) : null;
    if (body.estado !== undefined) {
      const e = String(body.estado);
      if (!ESTADOS.includes(e as typeof ESTADOS[number])) return NextResponse.json(errorResponse("estado inválido"), { status: 400 });
      update.estado = e;
    }

    const up = await ctx.supabase.from("solicitudes_compra").update(update).eq("id", id).eq("empresa_id", ctx.auth.empresa_id);
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });

    const del = await ctx.supabase.from("solicitudes_compra_items").delete().eq("empresa_id", ctx.auth.empresa_id).eq("solicitud_id", id);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });

    if (items.length > 0) {
      const rows = items.map((it, i) => ({
        solicitud_id: id,
        empresa_id: ctx.auth.empresa_id,
        orden: typeof it.orden === "number" ? it.orden : i,
        descripcion: String(it.descripcion ?? "").trim(),
        cantidad: num(it.cantidad) || 1,
        unidad: it.unidad ? String(it.unidad) : null,
        precio_estimado: numn(it.precio_estimado),
        observaciones: it.observaciones ? String(it.observaciones) : null,
      })).filter((r) => r.descripcion.length > 0);
      if (rows.length > 0) {
        const ins = await ctx.supabase.from("solicitudes_compra_items").insert(rows);
        if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
      }
    }
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const { error } = await ctx.supabase.from("solicitudes_compra").delete()
      .eq("id", id).eq("empresa_id", ctx.auth.empresa_id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
