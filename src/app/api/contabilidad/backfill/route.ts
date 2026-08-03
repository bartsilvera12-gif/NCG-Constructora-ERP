import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { asentarVenta, asentarCompra, asentarGasto } from "@/lib/contabilidad/asientos";

/**
 * POST /api/contabilidad/backfill?tipo=ventas|compras|gastos|todo&desde=&hasta=
 *
 * Barre todas las operaciones existentes y les genera el asiento correspondiente.
 * Idempotente (crearAsiento elimina el asiento previo con mismo origen).
 * Devuelve conteo de éxitos/errores por tipo.
 */
export async function POST(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const empresaId = ctx.auth.empresa_id;
  const sp = new URL(request.url).searchParams;
  const tipo = sp.get("tipo") ?? "todo";
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  const isDate = (s: string | null) => s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const resultado = {
    ventas: { ok: 0, error: 0, mensajes: [] as string[] },
    compras: { ok: 0, error: 0, mensajes: [] as string[] },
    gastos: { ok: 0, error: 0, mensajes: [] as string[] },
  };

  if (tipo === "ventas" || tipo === "todo") {
    let q = ctx.supabase.from("ventas")
      .select("id, numero_control")
      .eq("empresa_id", empresaId)
      .eq("tipo_documento", "venta");
    if (isDate(desde)) q = q.gte("fecha", desde!);
    if (isDate(hasta)) q = q.lte("fecha", hasta!);
    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(`Ventas: ${error.message}`), { status: 500 });
    for (const v of (data ?? []) as Array<{ id: string; numero_control: string }>) {
      const res = await asentarVenta(ctx.supabase, empresaId, v.id);
      if (res.ok) resultado.ventas.ok++;
      else { resultado.ventas.error++; resultado.ventas.mensajes.push(`${v.numero_control}: ${res.error}`); }
    }
  }

  if (tipo === "compras" || tipo === "todo") {
    let q = ctx.supabase.from("compras")
      .select("id, numero_comprobante")
      .eq("empresa_id", empresaId);
    if (isDate(desde)) q = q.gte("fecha", desde!);
    if (isDate(hasta)) q = q.lte("fecha", hasta!);
    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(`Compras: ${error.message}`), { status: 500 });
    for (const c of (data ?? []) as Array<{ id: string; numero_comprobante: string | null }>) {
      const res = await asentarCompra(ctx.supabase, empresaId, c.id);
      if (res.ok) resultado.compras.ok++;
      else { resultado.compras.error++; resultado.compras.mensajes.push(`${c.numero_comprobante ?? c.id}: ${res.error}`); }
    }
  }

  if (tipo === "gastos" || tipo === "todo") {
    let q = ctx.supabase.from("gastos")
      .select("id, descripcion")
      .eq("empresa_id", empresaId);
    if (isDate(desde)) q = q.gte("fecha", desde!);
    if (isDate(hasta)) q = q.lte("fecha", hasta!);
    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(`Gastos: ${error.message}`), { status: 500 });
    for (const g of (data ?? []) as Array<{ id: string; descripcion: string | null }>) {
      const res = await asentarGasto(ctx.supabase, empresaId, g.id);
      if (res.ok) resultado.gastos.ok++;
      else { resultado.gastos.error++; resultado.gastos.mensajes.push(`${(g.descripcion ?? g.id).slice(0, 40)}: ${res.error}`); }
    }
  }

  return NextResponse.json(successResponse(resultado));
}
