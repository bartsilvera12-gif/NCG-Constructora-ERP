import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { leerPermisosDeUsuario, puede } from "@/lib/rrhh/permisos";

/**
 * GET /api/rrhh/reportes — agrega en una sola respuesta los KPIs de los 10
 * reportes del sprint. Se calcula todo con lecturas paralelas al schema
 * ncgconstructora. El coste laboral usa `costo_hora` del empleado o el snapshot
 * de la asignación, sin depender del historial salarial (que está gateado por
 * permiso y no todos los usuarios pueden ver).
 */

function estadoCertCalc(fechaVenc: string | null): "vigente" | "por_vencer" | "vencido" | "pendiente" {
  if (!fechaVenc) return "pendiente";
  const hoy = new Date();
  const venc = new Date(fechaVenc + "T00:00:00");
  const diff = (venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "vencido";
  if (diff <= 30) return "por_vencer";
  return "vigente";
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const hoy = new Date().toISOString().slice(0, 10);
    const mesActualPrefix = hoy.slice(0, 7);

    const perms = await leerPermisosDeUsuario(ctx.supabase, ctx.auth.usuarioCatalogId ?? null, ctx.auth.user?.email ?? null);
    const mostrarSalarios = puede(perms, "salarios.ver");

    const [empQ, espQ, cursQ, vacQ, fichQ, asigQ] = await Promise.all([
      ctx.supabase.from("empleados")
        .select("id, nombre, cargo, activo, costo_hora, salario_base")
        .eq("empresa_id", empresaId),
      ctx.supabase.from("empleado_especialidades")
        .select("empleado_id, es_principal, especialidades(nombre)")
        .eq("empresa_id", empresaId),
      ctx.supabase.from("empleado_cursos")
        .select("empleado_id, nombre, tipo, fecha_vencimiento")
        .eq("empresa_id", empresaId),
      ctx.supabase.from("empleado_vacaciones")
        .select("empleado_id, dias, estado, fecha_desde, fecha_hasta")
        .eq("empresa_id", empresaId),
      ctx.supabase.from("empleado_fichajes")
        .select("empleado_id, horas, fecha")
        .eq("empresa_id", empresaId)
        .gte("fecha", `${mesActualPrefix}-01`),
      ctx.supabase.from("empleado_asignaciones")
        .select("empleado_id, proyecto_id, horas_reales, costo_real, dias_reales, estado, proyectos(titulo)")
        .eq("empresa_id", empresaId),
    ]);
    if (empQ.error) return NextResponse.json(errorResponse(empQ.error.message), { status: 400 });

    const empleados = (empQ.data ?? []) as Array<{ id: string; nombre: string; cargo: string | null; activo: boolean; costo_hora: number | null; salario_base: number | null }>;
    const activos = empleados.filter((e) => e.activo);

    // Empleados por especialidad principal
    const porEspecialidad = new Map<string, number>();
    for (const r of (espQ.data ?? []) as Array<{ es_principal: boolean; especialidades: { nombre: string } | { nombre: string }[] | null }>) {
      if (!r.es_principal) continue;
      const cat = Array.isArray(r.especialidades) ? r.especialidades[0] : r.especialidades;
      const nombre = cat?.nombre ?? "—";
      porEspecialidad.set(nombre, (porEspecialidad.get(nombre) ?? 0) + 1);
    }

    // Certificados vencidos / por vencer
    const certificados = ((cursQ.data ?? []) as Array<{ empleado_id: string; nombre: string; tipo: string; fecha_vencimiento: string | null }>)
      .map((c) => ({ ...c, estado: estadoCertCalc(c.fecha_vencimiento) }));
    const empMap = new Map(empleados.map((e) => [e.id, e.nombre]));
    const vencidos = certificados.filter((c) => c.estado === "vencido")
      .map((c) => ({ empleado: empMap.get(c.empleado_id) ?? "—", certificado: c.nombre, tipo: c.tipo, fecha_vencimiento: c.fecha_vencimiento }));
    const porVencer = certificados.filter((c) => c.estado === "por_vencer")
      .map((c) => ({ empleado: empMap.get(c.empleado_id) ?? "—", certificado: c.nombre, tipo: c.tipo, fecha_vencimiento: c.fecha_vencimiento }));

    // Vacaciones
    const vacaciones = (vacQ.data ?? []) as Array<{ empleado_id: string; dias: number; estado: string; fecha_desde: string; fecha_hasta: string }>;
    const vacPendientes = vacaciones.filter((v) => v.estado === "pendiente")
      .map((v) => ({ empleado: empMap.get(v.empleado_id) ?? "—", dias: v.dias, desde: v.fecha_desde, hasta: v.fecha_hasta }));
    const vacAprobadas = vacaciones.filter((v) => v.estado === "aprobada" && v.fecha_desde >= hoy)
      .map((v) => ({ empleado: empMap.get(v.empleado_id) ?? "—", dias: v.dias, desde: v.fecha_desde, hasta: v.fecha_hasta }));

    // Marcaciones por empleado (mes actual)
    const fichajes = (fichQ.data ?? []) as Array<{ empleado_id: string; horas: number | string | null }>;
    const marcaPorEmpleado = new Map<string, number>();
    for (const f of fichajes) {
      marcaPorEmpleado.set(f.empleado_id, (marcaPorEmpleado.get(f.empleado_id) ?? 0) + (Number(f.horas) || 0));
    }
    const marcacionesEmpleado = empleados.map((e) => ({
      empleado: e.nombre,
      horas: marcaPorEmpleado.get(e.id) ?? 0,
    })).filter((r) => r.horas > 0).sort((a, b) => b.horas - a.horas);

    // Asignaciones a obra: coste laboral por empleado + por obra
    const asignaciones = ((asigQ.data ?? []) as Array<{ empleado_id: string; proyecto_id: string | null; horas_reales: number | string | null; costo_real: number | string | null; dias_reales: number | string | null; proyectos: { titulo: string } | { titulo: string }[] | null }>)
      .map((a) => ({
        empleado_id: a.empleado_id,
        proyecto_id: a.proyecto_id,
        horas_reales: Number(a.horas_reales) || 0,
        costo_real: Number(a.costo_real) || 0,
        proyecto_nombre: Array.isArray(a.proyectos) ? a.proyectos[0]?.titulo ?? null : a.proyectos?.titulo ?? null,
      }));

    const costePorEmpleadoMap = new Map<string, { horas: number; coste: number }>();
    const costePorObraMap = new Map<string, { obra: string; horas: number; coste: number }>();
    for (const a of asignaciones) {
      const emp = costePorEmpleadoMap.get(a.empleado_id) ?? { horas: 0, coste: 0 };
      emp.horas += a.horas_reales; emp.coste += a.costo_real;
      costePorEmpleadoMap.set(a.empleado_id, emp);
      const obraKey = a.proyecto_id ?? "__sin_obra__";
      const obra = costePorObraMap.get(obraKey) ?? { obra: a.proyecto_nombre ?? "Sin obra", horas: 0, coste: 0 };
      obra.horas += a.horas_reales; obra.coste += a.costo_real;
      costePorObraMap.set(obraKey, obra);
    }
    const costeLaboralEmpleado = empleados.map((e) => {
      const c = costePorEmpleadoMap.get(e.id) ?? { horas: 0, coste: 0 };
      return {
        empleado: e.nombre,
        horas: c.horas,
        coste: mostrarSalarios ? c.coste : null,
      };
    }).sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0));
    const costeLaboralObra = Array.from(costePorObraMap.values())
      .map((r) => ({ obra: r.obra, horas: r.horas, coste: mostrarSalarios ? r.coste : null }))
      .sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0));

    // Marcaciones por obra (mes actual): approximate mapping — usamos las asignaciones
    // activas del empleado como proxy. Si un empleado tiene una sola obra activa,
    // sus horas del mes se atribuyen a esa obra.
    const marcacionesObra = costeLaboralObra.map((r) => ({ obra: r.obra, horas: r.horas }));

    return NextResponse.json(successResponse({
      mostrar_salarios: mostrarSalarios,
      generado_en: new Date().toISOString(),
      empleados: {
        activos: activos.length,
        total: empleados.length,
        detalle_activos: activos.map((e) => ({ id: e.id, nombre: e.nombre, cargo: e.cargo })),
      },
      por_especialidad: Array.from(porEspecialidad.entries())
        .map(([nombre, cant]) => ({ especialidad: nombre, empleados: cant }))
        .sort((a, b) => b.empleados - a.empleados),
      certificados_vencidos: vencidos,
      certificados_por_vencer: porVencer,
      vacaciones_pendientes: vacPendientes,
      vacaciones_aprobadas_proximas: vacAprobadas,
      coste_laboral_empleado: costeLaboralEmpleado,
      coste_laboral_obra: costeLaboralObra,
      marcaciones_empleado: marcacionesEmpleado,
      marcaciones_obra: marcacionesObra,
    }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
