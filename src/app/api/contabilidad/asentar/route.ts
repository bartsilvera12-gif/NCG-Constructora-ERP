import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { asentarVenta, asentarCompra, asentarGasto } from "@/lib/contabilidad/asientos";

/**
 * POST /api/contabilidad/asentar?tipo=venta|compra|gasto&id=<uuid>
 *
 * Genera (o regenera, si ya existía) el asiento de UN movimiento puntual.
 * Se llama fire-and-forget desde los flujos de alta de ventas / compras /
 * gastos para que el Libro Diario y Mayor se actualicen sin backfill.
 *
 * Idempotente: si ya había un asiento con ese origen, se elimina y recrea.
 * No bloquea al caller si falla — el caller ignora el error (el backfill
 * puede correrse después manualmente).
 */
export async function POST(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const empresaId = ctx.auth.empresa_id;
  const sp = new URL(request.url).searchParams;
  const tipo = sp.get("tipo");
  const id = sp.get("id");
  if (!id) return NextResponse.json(errorResponse("id requerido"), { status: 400 });

  let res: { ok: boolean; error?: string; asiento_id?: string };
  if (tipo === "venta") {
    res = await asentarVenta(ctx.supabase, empresaId, id);
  } else if (tipo === "compra") {
    res = await asentarCompra(ctx.supabase, empresaId, id);
  } else if (tipo === "gasto") {
    res = await asentarGasto(ctx.supabase, empresaId, id);
  } else {
    return NextResponse.json(errorResponse("tipo inválido (venta|compra|gasto)"), { status: 400 });
  }

  if (!res.ok) {
    console.warn(`[asentar ${tipo} ${id}]`, res.error);
    return NextResponse.json(errorResponse(res.error ?? "Error"), { status: 400 });
  }
  return NextResponse.json(successResponse({ asiento_id: res.asiento_id }));
}
