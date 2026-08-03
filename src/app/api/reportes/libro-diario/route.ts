import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/libro-diario?desde=&hasta=
 *
 * Lista asientos con sus líneas debe/haber ordenados cronológicamente.
 */

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const sp = new URL(request.url).searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");

  let q = ctx.supabase
    .from("asientos_contables")
    .select("id, numero, fecha, concepto, origen_tipo, origen_id, anulado, lineas:asientos_lineas(id, cuenta_id, debe, haber, descripcion, orden, cuenta:plan_cuentas(codigo, nombre))")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("anulado", false)
    .order("fecha", { ascending: true })
    .order("numero", { ascending: true });
  if (isDate(desde)) q = q.gte("fecha", desde);
  if (isDate(hasta)) q = q.lte("fecha", hasta);

  const { data, error } = await q;
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });

  const asientos = (data ?? []).map((a: Record<string, unknown>) => {
    const lineas = ((a.lineas ?? []) as Array<Record<string, unknown>>)
      .sort((x, y) => Number(x.orden ?? 0) - Number(y.orden ?? 0))
      .map((l) => {
        const c = l.cuenta as { codigo?: string; nombre?: string } | { codigo?: string; nombre?: string }[] | null;
        const cc = Array.isArray(c) ? c[0] : c;
        return {
          cuenta_codigo: cc?.codigo ?? "?",
          cuenta_nombre: cc?.nombre ?? "?",
          descripcion: (l.descripcion as string | null) ?? null,
          debe: Number(l.debe ?? 0),
          haber: Number(l.haber ?? 0),
        };
      });
    return {
      id: String(a.id),
      numero: String(a.numero),
      fecha: String(a.fecha),
      concepto: String(a.concepto ?? ""),
      origen_tipo: (a.origen_tipo as string) ?? null,
      origen_id: (a.origen_id as string) ?? null,
      lineas,
      total_debe: lineas.reduce((s, l) => s + l.debe, 0),
      total_haber: lineas.reduce((s, l) => s + l.haber, 0),
    };
  });
  const totals = asientos.reduce(
    (acc, a) => ({ debe: acc.debe + a.total_debe, haber: acc.haber + a.total_haber }),
    { debe: 0, haber: 0 }
  );
  return NextResponse.json(successResponse({ asientos, totals }));
}
