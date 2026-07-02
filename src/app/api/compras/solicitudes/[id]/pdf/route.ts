import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { buildSolicitudCompraPdf, type SolicitudCab, type SolicitudItem } from "@/lib/compras/solicitud-pdf";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;

    const [cabQ, itemsQ] = await Promise.all([
      ctx.supabase.from("solicitudes_compra").select("*")
        .eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle(),
      ctx.supabase.from("solicitudes_compra_items").select("*")
        .eq("empresa_id", ctx.auth.empresa_id).eq("solicitud_id", id)
        .order("orden", { ascending: true }),
    ]);
    if (cabQ.error) return NextResponse.json(errorResponse(cabQ.error.message), { status: 400 });
    if (!cabQ.data) return NextResponse.json(errorResponse("Solicitud no encontrada"), { status: 404 });
    if (itemsQ.error) return NextResponse.json(errorResponse(itemsQ.error.message), { status: 400 });

    const cab = cabQ.data as unknown as SolicitudCab;
    const items = (itemsQ.data ?? []) as unknown as SolicitudItem[];
    const bytes = await buildSolicitudCompraPdf(cab, items);

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${cab.numero}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
