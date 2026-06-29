import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { buildFichaPdf, type FichaEmpresa, type FichaEmpleado } from "@/lib/rrhh/ficha-pdf";

export const runtime = "nodejs";

/** GET /api/rrhh/empleados/[id]/ficha-pdf — descarga el PDF de la ficha del empleado. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

    const [empQ, empresaQ] = await Promise.all([
      ctx.supabase
        .from("empleados")
        .select("*")
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("id", id)
        .maybeSingle(),
      ctx.supabase
        .from("empresas")
        .select("nombre, nif, inscripcion_ss, cnae, centro_trabajo_direccion")
        .eq("id", ctx.auth.empresa_id)
        .maybeSingle(),
    ]);
    if (empQ.error) return NextResponse.json(errorResponse(empQ.error.message), { status: 400 });
    if (!empQ.data) return NextResponse.json(errorResponse("Empleado no encontrado"), { status: 404 });

    const empresa = (empresaQ.data ?? {
      nombre: null, nif: null, inscripcion_ss: null, cnae: null, centro_trabajo_direccion: null,
    }) as FichaEmpresa;

    const bytes = await buildFichaPdf(empresa, empQ.data as unknown as FichaEmpleado);

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
