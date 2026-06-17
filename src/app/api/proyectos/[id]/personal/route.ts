import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  calcularEstimado,
  isDiasTrabajoTipo,
  rangosSeSuperponen,
  type DiasTrabajoTipo,
} from "@/lib/proyectos/mano-obra-calculos";

/**
 * GET /api/proyectos/[id]/personal — asignaciones de empleados a una obra.
 *
 * Devuelve tanto filas legacy (modo='horas_dia' — un día con horas sueltas)
 * como filas nuevas (modo='periodo' — asignación por rango de fechas).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const pid = id?.trim() ?? "";
    if (!pid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

    const { data, error } = await ctx.supabase
      .from("empleado_asignaciones")
      .select(
        [
          "id",
          "empleado_id",
          "fecha",
          "horas",
          "costo_total",
          "observacion",
          "created_at",
          "modo",
          "fecha_desde",
          "fecha_hasta_estimada",
          "fecha_fin_real",
          "horas_por_dia",
          "dias_trabajo_tipo",
          "costo_hora_snapshot",
          "dias_estimados",
          "horas_estimadas",
          "costo_estimado",
          "dias_reales",
          "horas_reales",
          "costo_real",
          "estado",
          "motivo_finalizacion",
          "empleado_nombre_snapshot",
          "empleado_cargo_snapshot",
          "empleados:empleado_id(nombre, cargo)",
        ].join(", ")
      )
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("proyecto_id", pid)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const asignaciones = rows.map((row) => {
      const emp = row.empleados as
        | { nombre?: string; cargo?: string | null }
        | { nombre?: string; cargo?: string | null }[]
        | null;
      const e = Array.isArray(emp) ? emp[0] : emp;
      return {
        ...row,
        empleado_nombre: (row.empleado_nombre_snapshot as string | null) ?? e?.nombre ?? null,
        empleado_cargo: (row.empleado_cargo_snapshot as string | null) ?? e?.cargo ?? null,
        empleados: undefined,
      };
    });

    return NextResponse.json(successResponse({ asignaciones }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * POST /api/proyectos/[id]/personal — crea una asignación.
 *
 * Acepta dos modos por payload:
 *
 *   modo='horas_dia' (legacy, default si no se manda fecha_desde):
 *     Body: { empleado_id, fecha?, horas, costo_total?, observacion? }
 *
 *   modo='periodo' (nuevo):
 *     Body: { empleado_id, fecha_desde, fecha_hasta_estimada, horas_por_dia,
 *             dias_trabajo_tipo, costo_hora?, dias_manual?, observacion? }
 *     Calcula días/horas/costo estimados con calcularEstimado. Bloquea si ya
 *     hay otra asignación 'activa' del mismo empleado en la misma obra cuyo
 *     rango se superponga.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const pid = id?.trim() ?? "";
    if (!pid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const empleadoId = String(body.empleado_id ?? "").trim();
    if (!empleadoId) return NextResponse.json(errorResponse("Falta empleado_id"), { status: 400 });

    const esPeriodo =
      typeof body.fecha_desde === "string" && (body.fecha_desde as string).trim() !== "";

    if (esPeriodo) {
      return crearAsignacionPeriodo({
        ctx,
        proyectoId: pid,
        empleadoId,
        body,
      });
    }

    return crearAsignacionLegacy({
      ctx,
      proyectoId: pid,
      empleadoId,
      body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getTenantSupabaseFromAuth>>>;

async function crearAsignacionPeriodo(args: {
  ctx: Ctx;
  proyectoId: string;
  empleadoId: string;
  body: Record<string, unknown>;
}): Promise<NextResponse> {
  const { ctx, proyectoId, empleadoId, body } = args;
  const empresaId = ctx.auth.empresa_id;

  const fechaDesde = String(body.fecha_desde ?? "").trim();
  const fechaHasta = String(body.fecha_hasta_estimada ?? "").trim();
  if (!fechaDesde || !fechaHasta) {
    return NextResponse.json(
      errorResponse("fecha_desde y fecha_hasta_estimada son obligatorias"),
      { status: 400 }
    );
  }
  if (fechaHasta < fechaDesde) {
    return NextResponse.json(
      errorResponse("La fecha hasta no puede ser anterior a la fecha desde"),
      { status: 400 }
    );
  }

  const horasPorDia = Number(body.horas_por_dia);
  if (!Number.isFinite(horasPorDia) || horasPorDia <= 0) {
    return NextResponse.json(errorResponse("horas_por_dia debe ser > 0"), { status: 400 });
  }

  const tipoRaw = String(body.dias_trabajo_tipo ?? "lun_vie");
  if (!isDiasTrabajoTipo(tipoRaw)) {
    return NextResponse.json(errorResponse("dias_trabajo_tipo inválido"), { status: 400 });
  }
  const tipo: DiasTrabajoTipo = tipoRaw;

  // Cargar empleado para snapshot de nombre/cargo/costo_hora.
  const { data: emp, error: empErr } = await ctx.supabase
    .from("empleados")
    .select("id, nombre, cargo, costo_hora")
    .eq("empresa_id", empresaId)
    .eq("id", empleadoId)
    .maybeSingle();
  if (empErr) return NextResponse.json(errorResponse(empErr.message), { status: 400 });
  if (!emp) return NextResponse.json(errorResponse("Empleado no encontrado"), { status: 404 });

  const empleado = emp as { id: string; nombre: string; cargo: string | null; costo_hora: number | string };

  const costoHoraEntrada = body.costo_hora;
  const costoHora =
    costoHoraEntrada == null || costoHoraEntrada === ""
      ? Number(empleado.costo_hora) || 0
      : Number(costoHoraEntrada);
  if (!Number.isFinite(costoHora) || costoHora < 0) {
    return NextResponse.json(errorResponse("costo_hora inválido"), { status: 400 });
  }

  const diasManual = body.dias_manual == null || body.dias_manual === "" ? null : Number(body.dias_manual);

  const { dias, horas, costo } = calcularEstimado({
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta,
    horas_por_dia: horasPorDia,
    costo_hora: costoHora,
    dias_trabajo_tipo: tipo,
    dias_manual: diasManual,
  });

  // Validar superposición con otras asignaciones activas del mismo empleado en
  // la misma obra.
  const { data: solapadas, error: solErr } = await ctx.supabase
    .from("empleado_asignaciones")
    .select("id, fecha_desde, fecha_hasta_estimada")
    .eq("empresa_id", empresaId)
    .eq("proyecto_id", proyectoId)
    .eq("empleado_id", empleadoId)
    .eq("estado", "activa")
    .eq("modo", "periodo");
  if (solErr) return NextResponse.json(errorResponse(solErr.message), { status: 400 });
  for (const r of (solapadas ?? []) as Array<{
    fecha_desde: string | null;
    fecha_hasta_estimada: string | null;
  }>) {
    if (
      r.fecha_desde &&
      r.fecha_hasta_estimada &&
      rangosSeSuperponen(fechaDesde, fechaHasta, r.fecha_desde, r.fecha_hasta_estimada)
    ) {
      return NextResponse.json(
        errorResponse(
          "Ya existe una asignación activa del empleado con fechas que se superponen."
        ),
        { status: 409 }
      );
    }
  }

  const insert = {
    empresa_id: empresaId,
    empleado_id: empleadoId,
    proyecto_id: proyectoId,
    fecha: fechaDesde,
    horas,
    costo_total: costo,
    observacion: body.observacion ? String(body.observacion).trim() : null,
    modo: "periodo",
    fecha_desde: fechaDesde,
    fecha_hasta_estimada: fechaHasta,
    horas_por_dia: horasPorDia,
    dias_trabajo_tipo: tipo,
    costo_hora_snapshot: costoHora,
    dias_estimados: dias,
    horas_estimadas: horas,
    costo_estimado: costo,
    estado: "activa",
    empleado_nombre_snapshot: empleado.nombre,
    empleado_cargo_snapshot: empleado.cargo,
  };

  const { data, error } = await ctx.supabase
    .from("empleado_asignaciones")
    .insert([insert])
    .select()
    .single();

  if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
  return NextResponse.json(successResponse({ asignacion: data }));
}

async function crearAsignacionLegacy(args: {
  ctx: Ctx;
  proyectoId: string;
  empleadoId: string;
  body: Record<string, unknown>;
}): Promise<NextResponse> {
  const { ctx, proyectoId, empleadoId, body } = args;
  const horas = Number(body.horas) || 0;
  if (horas <= 0) return NextResponse.json(errorResponse("horas debe ser > 0"), { status: 400 });

  let costoTotal = Number(body.costo_total) || 0;
  if (costoTotal <= 0) {
    const { data: emp } = await ctx.supabase
      .from("empleados")
      .select("costo_hora")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", empleadoId)
      .maybeSingle();
    const ch = emp ? Number((emp as { costo_hora?: number | string }).costo_hora ?? 0) : 0;
    costoTotal = ch * horas;
  }

  const insert = {
    empresa_id: ctx.auth.empresa_id,
    empleado_id: empleadoId,
    proyecto_id: proyectoId,
    fecha: body.fecha ? String(body.fecha) : new Date().toISOString().slice(0, 10),
    horas,
    costo_total: costoTotal,
    observacion: body.observacion ? String(body.observacion).trim() : null,
    modo: "horas_dia",
  };

  const { data, error } = await ctx.supabase
    .from("empleado_asignaciones")
    .insert([insert])
    .select()
    .single();

  if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
  return NextResponse.json(successResponse({ asignacion: data }));
}
