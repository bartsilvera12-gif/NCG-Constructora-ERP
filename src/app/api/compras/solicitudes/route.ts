import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const ESTADOS = ["borrador","autorizado","comprado","facturado","cancelado"] as const;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numn = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Correlativo SC-YYYY-NNNN por empresa (best-effort; unique index protege). */
async function siguienteNumero(supabase: unknown, empresaId: string, fecha: string): Promise<string> {
  const anio = fecha.slice(0, 4);
  const prefix = `SC-${anio}-`;
  const sb = supabase as { from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { ilike: (col: string, p: string) => { order: (col: string, o: unknown) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: { numero: string } | null; error: unknown }> } } } } } } };
  const q = await sb.from("solicitudes_compra")
    .select("numero")
    .eq("empresa_id", empresaId)
    .ilike("numero", `${prefix}%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = q.data?.numero ?? null;
  let n = 1;
  if (last) {
    const m = /^SC-\d{4}-(\d+)$/.exec(last);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const sp = new URL(request.url).searchParams;
    const estado = sp.get("estado");

    let q = ctx.supabase
      .from("solicitudes_compra")
      .select("id, numero, fecha, estado, total_estimado, empleado_nombre_snapshot, proyecto_nombre_snapshot, proveedor_nombre_snapshot, observaciones, created_at")
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false });
    if (estado && ESTADOS.includes(estado as typeof ESTADOS[number])) q = q.eq("estado", estado);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ solicitudes: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fecha = String(body.fecha ?? new Date().toISOString().slice(0, 10));
    const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];

    // Snapshots
    const empresaId = ctx.auth.empresa_id;
    const [empQ, projQ, empleQ] = await Promise.all([
      ctx.supabase.from("empresas").select("nombre_empresa, nif").eq("id", empresaId).maybeSingle(),
      body.proyecto_id ? ctx.supabase.from("proyectos").select("titulo").eq("empresa_id", empresaId).eq("id", String(body.proyecto_id)).maybeSingle() : Promise.resolve({ data: null, error: null } as const),
      body.empleado_id ? ctx.supabase.from("empleados").select("nombre").eq("empresa_id", empresaId).eq("id", String(body.empleado_id)).maybeSingle() : Promise.resolve({ data: null, error: null } as const),
    ]);

    const numero = await siguienteNumero(ctx.supabase, empresaId, fecha);
    const totalEstimado = items.reduce((acc, it) => acc + num(it.cantidad) * num(it.precio_estimado), 0);

    const insCab = {
      empresa_id: empresaId,
      numero,
      fecha,
      proyecto_id: body.proyecto_id ? String(body.proyecto_id) : null,
      empleado_id: body.empleado_id ? String(body.empleado_id) : null,
      proveedor_id: body.proveedor_id ? String(body.proveedor_id) : null,
      empresa_nombre_snapshot: (empQ.data as { nombre_empresa?: string } | null)?.nombre_empresa ?? null,
      empresa_nif_snapshot: (empQ.data as { nif?: string } | null)?.nif ?? null,
      proyecto_nombre_snapshot: (projQ.data as { titulo?: string } | null)?.titulo ?? null,
      empleado_nombre_snapshot: (empleQ.data as { nombre?: string } | null)?.nombre ?? null,
      proveedor_nombre_snapshot: body.proveedor_nombre ? String(body.proveedor_nombre).trim() || null : null,
      observaciones: body.observaciones ? String(body.observaciones).trim() || null : null,
      total_estimado: totalEstimado,
      estado: "borrador",
      created_by: ctx.auth.user?.id ?? null,
    };

    const { data: created, error: insErr } = await ctx.supabase
      .from("solicitudes_compra").insert([insCab]).select().single();
    if (insErr || !created) return NextResponse.json(errorResponse(insErr?.message ?? "no se pudo crear"), { status: 400 });

    if (items.length > 0) {
      const rows = items.map((it, i) => ({
        solicitud_id: (created as { id: string }).id,
        empresa_id: empresaId,
        orden: typeof it.orden === "number" ? it.orden : i,
        descripcion: String(it.descripcion ?? "").trim(),
        cantidad: num(it.cantidad) || 1,
        unidad: it.unidad ? String(it.unidad) : null,
        precio_estimado: numn(it.precio_estimado),
        observaciones: it.observaciones ? String(it.observaciones) : null,
      })).filter((r) => r.descripcion.length > 0);
      if (rows.length > 0) {
        const { error } = await ctx.supabase.from("solicitudes_compra_items").insert(rows);
        if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
      }
    }

    return NextResponse.json(successResponse({ solicitud: created }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
