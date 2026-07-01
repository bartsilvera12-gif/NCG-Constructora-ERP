import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/rrhh/empleados/[id] — obtiene un empleado por id (mismo tenant).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(_request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

    const { data, error } = await ctx.supabase
      .from("empleados")
      .select("*")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    if (!data) return NextResponse.json(errorResponse("Empleado no encontrado"), { status: 404 });
    return NextResponse.json(successResponse({ empleado: data }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * PATCH /api/rrhh/empleados/[id] — edita campos del empleado.
 * Body: { nombre?, documento?, cargo?, salario_base?, costo_hora?, fecha_ingreso?, activo? }
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const TEXT_FIELDS = [
      "tipo_documento","documento","lugar_nacimiento","nacionalidad","estado_civil",
      "grupo_sanguineo","direccion","email","telefono","cargo","tipo_empleado","tipo_periodo",
      "departamento","seccion","supervisor","banco","numero_cuenta",
      "sucursal","chofer_habilitacion","chofer_observacion",
      "comision_politica_id","comision_observacion",
      // Fase A
      "tipo_contrato","jornada_laboral",
      "contacto_emergencia_nombre","contacto_emergencia_telefono","contacto_emergencia_parentesco",
      "observaciones",
    ];
    const DATE_FIELDS = ["fecha_nacimiento","fecha_ingreso","fecha_baja","chofer_fecha_venc"];
    const NUM_FIELDS = ["salario_base","salario_complementario","costo_hora"];
    const NUMN_FIELDS = ["chofer_km"];
    const BOOL_FIELDS = ["cobrar_con_cheque","excluir_liquidaciones","activo","participa_comisiones"];

    if (body.nombre !== undefined) {
      const n = String(body.nombre).trim();
      if (!n) return NextResponse.json(errorResponse("El nombre no puede estar vacío"), { status: 400 });
      update.nombre = n;
    }
    for (const k of TEXT_FIELDS) {
      if (body[k] !== undefined) update[k] = body[k] ? String(body[k]).trim() || null : null;
    }
    for (const k of DATE_FIELDS) {
      if (body[k] !== undefined) update[k] = body[k] ? String(body[k]) : null;
    }
    for (const k of NUM_FIELDS) {
      if (body[k] !== undefined) update[k] = Number(body[k]) || 0;
    }
    for (const k of NUMN_FIELDS) {
      if (body[k] !== undefined) {
        if (body[k] === null || body[k] === "") update[k] = null;
        else {
          const n = Number(body[k]);
          update[k] = Number.isFinite(n) ? n : null;
        }
      }
    }
    for (const k of BOOL_FIELDS) {
      if (body[k] !== undefined) update[k] = Boolean(body[k]);
    }
    // Fase A · estado ciclo de vida (validado)
    if (body.estado !== undefined) {
      const v = body.estado ? String(body.estado).trim() : null;
      if (v && !["activo","baja","suspendido","pendiente"].includes(v)) {
        return NextResponse.json(errorResponse("estado inválido"), { status: 400 });
      }
      update.estado = v;
    }

    if (body.tipos_empleado !== undefined) {
      const raw = Array.isArray(body.tipos_empleado) ? (body.tipos_empleado as unknown[]) : [];
      const clean = Array.from(new Set(
        raw.map((v) => String(v ?? "").trim().toLowerCase()).filter((s) => s.length > 0)
      ));
      update.tipos_empleado = clean;
    }

    const { error } = await ctx.supabase
      .from("empleados")
      .update(update)
      .eq("id", id)
      .eq("empresa_id", ctx.auth.empresa_id);

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
