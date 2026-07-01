import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { buildFichaPdf, type FichaEmpresa, type FichaEmpleado, type FichaExtras } from "@/lib/rrhh/ficha-pdf";
import { leerPermisosDeUsuario, puede } from "@/lib/rrhh/permisos";

export const runtime = "nodejs";

function estadoCalc(fechaVenc: string | null): "vigente" | "por_vencer" | "vencido" | "pendiente" {
  if (!fechaVenc) return "pendiente";
  const hoy = new Date();
  const venc = new Date(fechaVenc + "T00:00:00");
  const diff = (venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "vencido";
  if (diff <= 30) return "por_vencer";
  return "vigente";
}

/** GET /api/rrhh/empleados/[id]/ficha-pdf — descarga el PDF ampliado. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

    const empresaId = ctx.auth.empresa_id;

    // Permisos: mostrar salario sólo si el usuario tiene salarios.ver
    const perms = await leerPermisosDeUsuario(ctx.supabase, ctx.auth.usuarioCatalogId ?? null, ctx.auth.user?.email ?? null);
    const mostrarSalario = puede(perms, "salarios.ver");

    // Cargar todo en paralelo
    const hoy = new Date().toISOString().slice(0, 10);
    const [empQ, empresaQ, espQ, salQ, cursQ, asigQ] = await Promise.all([
      ctx.supabase.from("empleados").select("*").eq("empresa_id", empresaId).eq("id", id).maybeSingle(),
      ctx.supabase.from("empresas").select("nombre_empresa, nif, inscripcion_ss, cnae, centro_trabajo_direccion")
        .eq("id", empresaId).maybeSingle(),
      ctx.supabase.from("empleado_especialidades")
        .select("es_principal, nivel, especialidades(nombre)")
        .eq("empresa_id", empresaId).eq("empleado_id", id)
        .order("es_principal", { ascending: false }),
      mostrarSalario
        ? ctx.supabase.from("empleado_salario_vigente_v")
            .select("*").eq("empresa_id", empresaId).eq("empleado_id", id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
      ctx.supabase.from("empleado_cursos")
        .select("nombre, tipo, entidad_emisora, fecha_emision, fecha_vencimiento")
        .eq("empresa_id", empresaId).eq("empleado_id", id)
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
      ctx.supabase.from("empleado_asignaciones")
        .select("fecha_desde, fecha_hasta_estimada, estado, proyectos(titulo)")
        .eq("empresa_id", empresaId).eq("empleado_id", id).eq("estado", "activa")
        .lte("fecha_desde", hoy)
        .order("fecha_desde", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (empQ.error) return NextResponse.json(errorResponse(empQ.error.message), { status: 400 });
    if (!empQ.data) return NextResponse.json(errorResponse("Empleado no encontrado"), { status: 404 });

    const empresaRow = empresaQ.data as { nombre_empresa?: string | null; nif?: string | null; inscripcion_ss?: string | null; cnae?: string | null; centro_trabajo_direccion?: string | null } | null;
    const empresa: FichaEmpresa = {
      nombre: empresaRow?.nombre_empresa ?? null,
      nif: empresaRow?.nif ?? null,
      inscripcion_ss: empresaRow?.inscripcion_ss ?? null,
      cnae: empresaRow?.cnae ?? null,
      centro_trabajo_direccion: empresaRow?.centro_trabajo_direccion ?? null,
    };

    const especialidades = ((espQ.data ?? []) as Array<{ es_principal: boolean; nivel: string | null; especialidades: { nombre: string } | { nombre: string }[] | null }>)
      .map((r) => {
        const cat = Array.isArray(r.especialidades) ? r.especialidades[0] : r.especialidades;
        return {
          nombre: cat?.nombre ?? "—",
          es_principal: !!r.es_principal,
          nivel: r.nivel,
        };
      });

    const salarioVigente = mostrarSalario && salQ.data ? {
      fecha_desde: (salQ.data as Record<string, string>).fecha_vigencia_desde,
      fecha_hasta: (salQ.data as Record<string, string | null>).fecha_vigencia_hasta,
      salario_bruto: Number((salQ.data as Record<string, unknown>).salario_bruto) || 0,
      salario_neto: (salQ.data as Record<string, unknown>).salario_neto !== null ? Number((salQ.data as Record<string, unknown>).salario_neto) : null,
      plus_peligrosidad: Number((salQ.data as Record<string, unknown>).plus_peligrosidad) || 0,
      plus_prl: Number((salQ.data as Record<string, unknown>).plus_prl) || 0,
      coste_empresa: (salQ.data as Record<string, unknown>).coste_empresa !== null ? Number((salQ.data as Record<string, unknown>).coste_empresa) : null,
      moneda: String((salQ.data as Record<string, unknown>).moneda ?? "EUR"),
    } : null;

    const cursos = ((cursQ.data ?? []) as Array<{ nombre: string; tipo: string; entidad_emisora: string | null; fecha_emision: string | null; fecha_vencimiento: string | null }>)
      .map((c) => ({ ...c, estado: estadoCalc(c.fecha_vencimiento) }));

    const asig = asigQ.data as { fecha_desde: string | null; fecha_hasta_estimada: string | null; proyectos: { titulo: string } | { titulo: string }[] | null } | null;
    const obraActual = asig ? {
      proyecto_nombre: Array.isArray(asig.proyectos) ? asig.proyectos[0]?.titulo ?? null : asig.proyectos?.titulo ?? null,
      fecha_desde: asig.fecha_desde,
      fecha_hasta_estimada: asig.fecha_hasta_estimada,
    } : null;

    const extras: FichaExtras = { especialidades, salarioVigente, mostrarSalario, cursos, obraActual };

    const bytes = await buildFichaPdf(empresa, empQ.data as unknown as FichaEmpleado, extras);

    const slug = (empQ.data.nombre ?? "empleado")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60);
    const filename = `ficha-${slug}.pdf`;

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
