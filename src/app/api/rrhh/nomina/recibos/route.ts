import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/rrhh/nomina/recibos?mes=YYYY-MM
 * Lista recibos del tenant. Si viene `mes`, filtra por periodo_desde dentro del mes.
 *
 * POST /api/rrhh/nomina/recibos
 * Crea un recibo (cabecera + devengos + deducciones) tomando snapshots de
 * empresa y empleado en el momento de la creación.
 */

type ReciboBody = {
  empleado_id?: string;
  periodo_desde?: string;
  periodo_hasta?: string;
  total_dias?: number;
  dias_cotizados?: number;
  observaciones?: string | null;
  devengos?: Array<{
    concepto?: string;
    cantidad?: number | null;
    importe_unitario?: number | null;
    importe_total?: number;
    es_salarial?: boolean;
    orden?: number;
  }>;
  deducciones?: Array<{
    tipo?: string;
    concepto?: string;
    base?: number | null;
    tipo_pct?: number | null;
    importe?: number;
    orden?: number;
  }>;
};

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numn = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const sp = new URL(request.url).searchParams;
    const mes = sp.get("mes");

    let q = ctx.supabase
      .from("nomina_recibos")
      .select("id, empleado_id, empleado_nombre_snapshot, periodo_desde, periodo_hasta, total_devengado, total_deducciones, liquido, coste_empresa, estado, created_at")
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("periodo_desde", { ascending: false })
      .order("empleado_nombre_snapshot", { ascending: true });

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const desde = `${mes}-01`;
      const [y, m] = mes.split("-").map((v) => parseInt(v, 10));
      const hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      q = q.gte("periodo_desde", desde).lt("periodo_desde", hasta);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ recibos: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as ReciboBody;
    const empleadoId = String(body.empleado_id ?? "").trim();
    if (!empleadoId) return NextResponse.json(errorResponse("empleado_id obligatorio"), { status: 400 });
    const periodoDesde = String(body.periodo_desde ?? "").trim();
    const periodoHasta = String(body.periodo_hasta ?? "").trim();
    if (!periodoDesde || !periodoHasta) {
      return NextResponse.json(errorResponse("periodo_desde y periodo_hasta obligatorios"), { status: 400 });
    }

    // Snapshots: leer empresa + empleado en el momento de la creación
    const [empresaQ, empleadoQ] = await Promise.all([
      ctx.supabase
        .from("empresas")
        .select("nombre, nif, inscripcion_ss, cnae, centro_trabajo_direccion")
        .eq("id", ctx.auth.empresa_id)
        .maybeSingle(),
      ctx.supabase
        .from("empleados")
        .select("nombre, documento, afiliacion_ss, categoria_nivel, grupo_cotizacion, cargo, fecha_ingreso")
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("id", empleadoId)
        .maybeSingle(),
    ]);
    if (empresaQ.error) return NextResponse.json(errorResponse(empresaQ.error.message), { status: 400 });
    if (empleadoQ.error) return NextResponse.json(errorResponse(empleadoQ.error.message), { status: 400 });
    if (!empleadoQ.data) return NextResponse.json(errorResponse("Empleado no encontrado"), { status: 404 });

    const empresa = empresaQ.data ?? {};
    const empleado = empleadoQ.data;

    const devengos = Array.isArray(body.devengos) ? body.devengos : [];
    const deducciones = Array.isArray(body.deducciones) ? body.deducciones : [];

    const totalDevengado = devengos.reduce((acc, d) => acc + num(d.importe_total), 0);
    const totalDeducTrab = deducciones
      .filter((d) => d.tipo === "aportacion_trabajador" || d.tipo === "irpf" || d.tipo === "especie")
      .reduce((acc, d) => acc + num(d.importe), 0);
    const totalAportEmpresa = deducciones
      .filter((d) => d.tipo === "aportacion_empresa")
      .reduce((acc, d) => acc + num(d.importe), 0);
    const liquido = totalDevengado - totalDeducTrab;
    const costeEmpresa = totalDevengado + totalAportEmpresa;

    const cabeceraInsert = {
      empresa_id: ctx.auth.empresa_id,
      empleado_id: empleadoId,
      periodo_desde: periodoDesde,
      periodo_hasta: periodoHasta,
      total_dias: Math.trunc(num(body.total_dias)) || 30,
      dias_cotizados: Math.trunc(num(body.dias_cotizados)) || 30,
      empresa_nombre_snapshot: (empresa as Record<string, unknown>).nombre ?? null,
      empresa_nif_snapshot: (empresa as Record<string, unknown>).nif ?? null,
      empresa_inscripcion_ss_snapshot: (empresa as Record<string, unknown>).inscripcion_ss ?? null,
      empresa_cnae_snapshot: (empresa as Record<string, unknown>).cnae ?? null,
      empresa_centro_snapshot: (empresa as Record<string, unknown>).centro_trabajo_direccion ?? null,
      empleado_nombre_snapshot: empleado.nombre,
      empleado_nif_snapshot: empleado.documento,
      empleado_afiliacion_snapshot: empleado.afiliacion_ss,
      empleado_categoria_snapshot: empleado.categoria_nivel,
      empleado_grupo_cot_snapshot: empleado.grupo_cotizacion,
      empleado_puesto_snapshot: empleado.cargo,
      empleado_antiguedad_snapshot: empleado.fecha_ingreso,
      total_devengado: totalDevengado,
      total_deducciones: totalDeducTrab,
      liquido,
      coste_empresa: costeEmpresa,
      estado: "borrador",
      observaciones: body.observaciones ? String(body.observaciones).trim() || null : null,
    };

    const { data: rec, error: recErr } = await ctx.supabase
      .from("nomina_recibos")
      .insert([cabeceraInsert])
      .select()
      .single();
    if (recErr) return NextResponse.json(errorResponse(recErr.message), { status: 400 });

    if (devengos.length > 0) {
      const rows = devengos.map((d, i) => ({
        recibo_id: rec.id,
        empresa_id: ctx.auth.empresa_id,
        concepto: String(d.concepto ?? "").trim() || "Concepto",
        cantidad: numn(d.cantidad),
        importe_unitario: numn(d.importe_unitario),
        importe_total: num(d.importe_total),
        es_salarial: d.es_salarial !== false,
        orden: typeof d.orden === "number" ? d.orden : i,
      }));
      const { error } = await ctx.supabase.from("nomina_recibo_devengos").insert(rows);
      if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    if (deducciones.length > 0) {
      const rows = deducciones.map((d, i) => ({
        recibo_id: rec.id,
        empresa_id: ctx.auth.empresa_id,
        tipo: d.tipo ?? "aportacion_trabajador",
        concepto: String(d.concepto ?? "").trim() || "Concepto",
        base: numn(d.base),
        tipo_pct: numn(d.tipo_pct),
        importe: num(d.importe),
        orden: typeof d.orden === "number" ? d.orden : i,
      }));
      const { error } = await ctx.supabase.from("nomina_recibo_deducciones").insert(rows);
      if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    return NextResponse.json(successResponse({ recibo: rec }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
