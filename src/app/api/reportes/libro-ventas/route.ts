import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchLibroVentas } from "@/lib/contabilidad/libros-data";

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const sp = new URL(request.url).searchParams;
  try {
    const { rows, totals } = await fetchLibroVentas(ctx.supabase, ctx.auth.empresa_id, {
      desde: sp.get("desde"), hasta: sp.get("hasta"),
    });
    return NextResponse.json(successResponse({ rows, totals }));
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
