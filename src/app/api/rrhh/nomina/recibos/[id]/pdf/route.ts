import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { buildReciboPdf, type ReciboCabecera, type ReciboDevengo, type ReciboDeduccion } from "@/lib/rrhh/recibo-pdf";

export const runtime = "nodejs";

/** GET /api/rrhh/nomina/recibos/[id]/pdf — descarga el PDF del recibo. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

    const [recQ, devQ, dedQ] = await Promise.all([
      ctx.supabase.from("nomina_recibos").select("*").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle(),
      ctx.supabase.from("nomina_recibo_devengos").select("*").eq("empresa_id", ctx.auth.empresa_id).eq("recibo_id", id).order("orden", { ascending: true }),
      ctx.supabase.from("nomina_recibo_deducciones").select("*").eq("empresa_id", ctx.auth.empresa_id).eq("recibo_id", id).order("orden", { ascending: true }),
    ]);
    if (recQ.error) return NextResponse.json(errorResponse(recQ.error.message), { status: 400 });
    if (!recQ.data) return NextResponse.json(errorResponse("Recibo no encontrado"), { status: 404 });
    if (devQ.error) return NextResponse.json(errorResponse(devQ.error.message), { status: 400 });
    if (dedQ.error) return NextResponse.json(errorResponse(dedQ.error.message), { status: 400 });

    const cab = recQ.data as unknown as ReciboCabecera;
    const devengos = (devQ.data ?? []) as unknown as ReciboDevengo[];
    const deducciones = (dedQ.data ?? []) as unknown as ReciboDeduccion[];

    const bytes = await buildReciboPdf(cab, devengos, deducciones);

    const slug = (cab.empleado_nombre_snapshot ?? "recibo")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60);
    const filename = `nomina-${slug}-${cab.periodo_desde}.pdf`;

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
