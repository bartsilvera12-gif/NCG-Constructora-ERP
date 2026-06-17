import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  calcularEstimado,
  diasTrabajablesEntre,
  isDiasTrabajoTipo,
  rangosSeSuperponen,
  type DiasTrabajoTipo,
} from "@/lib/proyectos/mano-obra-calculos";

/**
 * PATCH /api/proyectos/[id]/personal/[asignacionId]
 *
 * Acciones soportadas según body:
 *
 *   { accion: "finalizar", fecha_fin_real, motivo_finalizacion?, observacion? }
 *     Marca estado='finalizada', calcula días/horas/costo reales hasta la
 *     fecha real, y reemplaza horas/costo_total con los valores reales para
 *     que la rentabilidad refleje el costo real.
 *
 *   { accion: "cancelar", motivo_finalizacion?, observacion? }
 *     Marca estado='cancelada' y pone horas/costo_total/horas_reales/costo_real
 *     en 0 (no suma a rentabilidad).
 *
 *   { accion: "editar", ...campos }
 *     Edita una asignación 'activa' en modo periodo, recalculando estimados.
 *     Campos: fecha_desde, fecha_hasta_estimada, horas_por_dia,
 *     dias_trabajo_tipo, costo_hora, dias_manual, observacion.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; asignacionId: string }> }
) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id, asignacionId } = await params;
    const pid = id?.trim() ?? "";
    const aid = asignacionId?.trim() ?? "";
    if (!pid || !aid) {
      return NextResponse.json(errorResponse("id y asignacionId son obligatorios"), { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accion = String(body.accion ?? "").trim();

    const { data: actual, error: eActual } = await ctx.supabase
      .from("empleado_asignaciones")
      .select("*")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("proyecto_id", pid)
      .eq("id", aid)
      .maybeSingle();
    if (eActual) return NextResponse.json(errorResponse(eActual.message), { status: 400 });
    if (!actual) return NextResponse.json(errorResponse("Asignación no encontrada"), { status: 404 });

    if (accion === "finalizar") {
      return finalizarAsignacion({ ctx, asignacionId: aid, actual: actual as RowAsig, body });
    }
    if (accion === "cancelar") {
      return cancelarAsignacion({ ctx, asignacionId: aid, body });
    }
    if (accion === "editar") {
      return editarAsignacion({
        ctx,
        proyectoId: pid,
        asignacionId: aid,
        actual: actual as RowAsig,
        body,
      });
    }
    return NextResponse.json(errorResponse("accion inválida"), { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * DELETE /api/proyectos/[id]/personal/[asignacionId]
 *
 * Borra una asignación. Se usa para limpiar errores de carga (no como flujo
 * normal — para "retirar" empleado conviene PATCH accion=finalizar).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; asignacionId: string }> }
) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id, asignacionId } = await params;
    const pid = id?.trim() ?? "";
    const aid = asignacionId?.trim() ?? "";
    if (!pid || !aid) {
      return NextResponse.json(errorResponse("id y asignacionId son obligatorios"), { status: 400 });
    }

    const { error } = await ctx.supabase
      .from("empleado_asignaciones")
      .delete()
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("proyecto_id", pid)
      .eq("id", aid);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getTenantSupabaseFromAuth>>>;

type RowAsig = {
  id: string;
  empleado_id: string;
  proyecto_id: string;
  modo: string | null;
  fecha_desde: string | null;
  fecha_hasta_estimada: string | null;
  horas_por_dia: number | string | null;
  dias_trabajo_tipo: string | null;
  costo_hora_snapshot: number | string | null;
  estado: string | null;
  observacion: string | null;
};

async function finalizarAsignacion(args: {
  ctx: Ctx;
  asignacionId: string;
  actual: RowAsig;
  body: Record<string, unknown>;
}): Promise<NextResponse> {
  const { ctx, asignacionId, actual, body } = args;
  if (actual.modo !== "periodo") {
    return NextResponse.json(
      errorResponse("Solo se pueden finalizar asignaciones por período"),
      { status: 400 }
    );
  }
  if (actual.estado !== "activa") {
    return NextResponse.json(
      errorResponse("La asignación ya no está activa"),
      { status: 400 }
    );
  }

  const fechaFinReal = String(body.fecha_fin_real ?? "").trim();
  if (!fechaFinReal) {
    return NextResponse.json(errorResponse("Falta fecha_fin_real"), { status: 400 });
  }
  if (!actual.fecha_desde) {
    return NextResponse.json(
      errorResponse("La asignación no tiene fecha_desde"),
      { status: 400 }
    );
  }
  if (fechaFinReal < actual.fecha_desde) {
    return NextResponse.json(
      errorResponse("La fecha real no puede ser anterior a la fecha desde"),
      { status: 400 }
    );
  }

  const tipoRaw = String(actual.dias_trabajo_tipo ?? "lun_vie");
  const tipo: DiasTrabajoTipo = isDiasTrabajoTipo(tipoRaw) ? tipoRaw : "lun_vie";
  const horasDia = Number(actual.horas_por_dia) || 0;
  const costoHora = Number(actual.costo_hora_snapshot) || 0;

  const diasReales = diasTrabajablesEntre(actual.fecha_desde, fechaFinReal, tipo);
  const horasReales = diasReales * horasDia;
  const costoReal = horasReales * costoHora;

  const motivo = body.motivo_finalizacion ? String(body.motivo_finalizacion).trim() : null;
  const observacion =
    body.observacion === undefined ? actual.observacion : body.observacion ? String(body.observacion).trim() : null;

  const update = {
    estado: "finalizada",
    fecha_fin_real: fechaFinReal,
    dias_reales: diasReales,
    horas_reales: horasReales,
    costo_real: costoReal,
    horas: horasReales,
    costo_total: costoReal,
    motivo_finalizacion: motivo,
    observacion,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.supabase
    .from("empleado_asignaciones")
    .update(update)
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("id", asignacionId)
    .select()
    .single();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
  return NextResponse.json(successResponse({ asignacion: data }));
}

async function cancelarAsignacion(args: {
  ctx: Ctx;
  asignacionId: string;
  body: Record<string, unknown>;
}): Promise<NextResponse> {
  const { ctx, asignacionId, body } = args;
  const motivo = body.motivo_finalizacion ? String(body.motivo_finalizacion).trim() : null;
  const update = {
    estado: "cancelada",
    horas: 0,
    costo_total: 0,
    horas_reales: 0,
    costo_real: 0,
    dias_reales: 0,
    motivo_finalizacion: motivo,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await ctx.supabase
    .from("empleado_asignaciones")
    .update(update)
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("id", asignacionId)
    .select()
    .single();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
  return NextResponse.json(successResponse({ asignacion: data }));
}

async function editarAsignacion(args: {
  ctx: Ctx;
  proyectoId: string;
  asignacionId: string;
  actual: RowAsig;
  body: Record<string, unknown>;
}): Promise<NextResponse> {
  const { ctx, proyectoId, asignacionId, actual, body } = args;
  if (actual.modo !== "periodo") {
    return NextResponse.json(
      errorResponse("Solo se pueden editar asignaciones por período"),
      { status: 400 }
    );
  }
  if (actual.estado !== "activa") {
    return NextResponse.json(
      errorResponse("Solo se pueden editar asignaciones activas"),
      { status: 400 }
    );
  }

  const fechaDesde = (body.fecha_desde ? String(body.fecha_desde) : actual.fecha_desde) ?? "";
  const fechaHasta =
    (body.fecha_hasta_estimada ? String(body.fecha_hasta_estimada) : actual.fecha_hasta_estimada) ?? "";
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

  const horasPorDia =
    body.horas_por_dia != null && body.horas_por_dia !== ""
      ? Number(body.horas_por_dia)
      : Number(actual.horas_por_dia);
  if (!Number.isFinite(horasPorDia) || horasPorDia <= 0) {
    return NextResponse.json(errorResponse("horas_por_dia debe ser > 0"), { status: 400 });
  }

  const tipoRaw = body.dias_trabajo_tipo != null && body.dias_trabajo_tipo !== ""
    ? String(body.dias_trabajo_tipo)
    : String(actual.dias_trabajo_tipo ?? "lun_vie");
  if (!isDiasTrabajoTipo(tipoRaw)) {
    return NextResponse.json(errorResponse("dias_trabajo_tipo inválido"), { status: 400 });
  }
  const tipo: DiasTrabajoTipo = tipoRaw;

  const costoHora =
    body.costo_hora != null && body.costo_hora !== ""
      ? Number(body.costo_hora)
      : Number(actual.costo_hora_snapshot);
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

  // Solapamiento: revisar otras asignaciones activas del mismo empleado, esta obra, excluyendo la actual.
  const { data: solapadas, error: solErr } = await ctx.supabase
    .from("empleado_asignaciones")
    .select("id, fecha_desde, fecha_hasta_estimada")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("proyecto_id", proyectoId)
    .eq("empleado_id", actual.empleado_id)
    .eq("estado", "activa")
    .eq("modo", "periodo")
    .neq("id", asignacionId);
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
          "Ya existe otra asignación activa del empleado con fechas que se superponen."
        ),
        { status: 409 }
      );
    }
  }

  const observacion =
    body.observacion === undefined ? actual.observacion : body.observacion ? String(body.observacion).trim() : null;

  const update = {
    fecha: fechaDesde,
    fecha_desde: fechaDesde,
    fecha_hasta_estimada: fechaHasta,
    horas_por_dia: horasPorDia,
    dias_trabajo_tipo: tipo,
    costo_hora_snapshot: costoHora,
    dias_estimados: dias,
    horas_estimadas: horas,
    costo_estimado: costo,
    horas,
    costo_total: costo,
    observacion,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.supabase
    .from("empleado_asignaciones")
    .update(update)
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("id", asignacionId)
    .select()
    .single();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
  return NextResponse.json(successResponse({ asignacion: data }));
}
