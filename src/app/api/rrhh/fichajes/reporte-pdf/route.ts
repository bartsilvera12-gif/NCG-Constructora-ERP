import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { buildMarcacionesPdf, type MarcacionRow, type MarcacionesEmpresa } from "@/lib/rrhh/marcaciones-pdf";

export const runtime = "nodejs";

/** GET /api/rrhh/fichajes/reporte-pdf?empleadoId=&desde=&hasta= */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const sp = new URL(request.url).searchParams;
    const empleadoId = sp.get("empleadoId");
    const hoy = new Date();
    const desdeDefault = new Date(hoy); desdeDefault.setDate(hoy.getDate() - 30);
    const desde = sp.get("desde") ?? desdeDefault.toISOString().slice(0, 10);
    const hasta = sp.get("hasta") ?? hoy.toISOString().slice(0, 10);

    let q = ctx.supabase
      .from("empleado_fichajes")
      .select("fecha, hora_entrada, hora_salida, horas, observacion, marcado_kiosco, empleados:empleado_id(nombre)")
      .eq("empresa_id", ctx.auth.empresa_id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true });
    if (empleadoId) q = q.eq("empleado_id", empleadoId);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const filas: MarcacionRow[] = (data ?? []).map((row: Record<string, unknown>) => {
      const emp = row.empleados as { nombre?: string } | { nombre?: string }[] | null;
      const e = Array.isArray(emp) ? emp[0] : emp;
      return {
        fecha: String(row.fecha),
        empleado_nombre: e?.nombre ?? null,
        hora_entrada: (row.hora_entrada as string | null) ?? null,
        hora_salida: (row.hora_salida as string | null) ?? null,
        horas: row.horas !== null && row.horas !== undefined ? Number(row.horas) : null,
        observacion: (row.observacion as string | null) ?? null,
        marcado_kiosco: (row.marcado_kiosco as boolean | null) ?? null,
      };
    });

    // Empresa + nombre empleado (si aplica)
    const [empresaQ, empQ] = await Promise.all([
      ctx.supabase.from("empresas")
        .select("nombre_empresa, nif, centro_trabajo_direccion")
        .eq("id", ctx.auth.empresa_id).maybeSingle(),
      empleadoId
        ? ctx.supabase.from("empleados").select("nombre").eq("empresa_id", ctx.auth.empresa_id).eq("id", empleadoId).maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
    ]);
    const empresaRow = empresaQ.data as { nombre_empresa?: string | null; nif?: string | null; centro_trabajo_direccion?: string | null } | null;
    const empresa: MarcacionesEmpresa = {
      nombre: empresaRow?.nombre_empresa ?? null,
      nif: empresaRow?.nif ?? null,
      centro: empresaRow?.centro_trabajo_direccion ?? null,
    };
    const empleadoNombre = (empQ.data as { nombre?: string } | null)?.nombre ?? null;

    const bytes = await buildMarcacionesPdf(empresa, empleadoNombre, desde, hasta, filas);

    const slug = (empleadoNombre ?? "todos")
      .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
    const filename = `marcaciones-${slug}-${desde}-${hasta}.pdf`;

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
