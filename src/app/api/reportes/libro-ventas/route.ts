import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/libro-ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Registra las ventas (tipo_documento='venta') con desglose IVA español
 * (4/10/21% + exento). Devuelve filas + totales agregados.
 */

type Row = {
  id: string;
  fecha: string;
  numero: string;
  cliente_nombre: string;
  cliente_nif: string | null;
  base_iva_4: number;
  base_iva_10: number;
  base_iva_21: number;
  base_exento: number;
  iva_4: number;
  iva_10: number;
  iva_21: number;
  total: number;
};

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function tasa(tipo: string | null): number {
  if (tipo === "21%") return 0.21;
  if (tipo === "10%") return 0.10;
  if (tipo === "4%") return 0.04;
  return 0;
}

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const sp = new URL(request.url).searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");

  let q = ctx.supabase
    .from("ventas")
    .select("id, numero_control, fecha, total, monto_iva, cliente_id, clientes:cliente_id(empresa, nombre_contacto, ruc)")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("tipo_documento", "venta")
    .order("fecha", { ascending: true });
  if (isDate(desde)) q = q.gte("fecha", desde);
  if (isDate(hasta)) q = q.lte("fecha", hasta);

  const { data, error } = await q;
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });

  // Cargamos items de todas las ventas para desglosar por tipo_iva.
  const ventaIds = (data ?? []).map((r: { id: string }) => r.id);
  const itemsMap = new Map<string, Array<{ tipo_iva: string | null; total_linea: number }>>();
  if (ventaIds.length > 0) {
    const iQ = await ctx.supabase
      .from("ventas_items")
      .select("venta_id, tipo_iva, total_linea")
      .eq("empresa_id", ctx.auth.empresa_id)
      .in("venta_id", ventaIds);
    for (const it of (iQ.data ?? []) as Array<{ venta_id: string; tipo_iva: string | null; total_linea: number }>) {
      const arr = itemsMap.get(it.venta_id) ?? [];
      arr.push({ tipo_iva: it.tipo_iva, total_linea: Number(it.total_linea) });
      itemsMap.set(it.venta_id, arr);
    }
  }

  const rows: Row[] = (data ?? []).map((v: Record<string, unknown>) => {
    const items = itemsMap.get(String(v.id)) ?? [];
    const bucket = { b4: 0, b10: 0, b21: 0, bex: 0, i4: 0, i10: 0, i21: 0 };
    for (const it of items) {
      const t = tasa(it.tipo_iva);
      const totalLinea = it.total_linea;
      const base = t > 0 ? totalLinea / (1 + t) : totalLinea;
      const ivaLinea = totalLinea - base;
      if (t === 0.04) { bucket.b4 += base; bucket.i4 += ivaLinea; }
      else if (t === 0.10) { bucket.b10 += base; bucket.i10 += ivaLinea; }
      else if (t === 0.21) { bucket.b21 += base; bucket.i21 += ivaLinea; }
      else bucket.bex += totalLinea;
    }
    const cliente = v.clientes as { empresa?: string; nombre_contacto?: string; ruc?: string | null } | { empresa?: string; nombre_contacto?: string; ruc?: string | null }[] | null;
    const c = Array.isArray(cliente) ? cliente[0] : cliente;
    const nombre = (c?.empresa?.trim() || c?.nombre_contacto?.trim() || "—");
    return {
      id: String(v.id),
      fecha: String(v.fecha),
      numero: String(v.numero_control ?? ""),
      cliente_nombre: nombre,
      cliente_nif: c?.ruc ?? null,
      base_iva_4: bucket.b4,
      base_iva_10: bucket.b10,
      base_iva_21: bucket.b21,
      base_exento: bucket.bex,
      iva_4: bucket.i4,
      iva_10: bucket.i10,
      iva_21: bucket.i21,
      total: Number(v.total ?? 0),
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      base_iva_4: acc.base_iva_4 + r.base_iva_4,
      base_iva_10: acc.base_iva_10 + r.base_iva_10,
      base_iva_21: acc.base_iva_21 + r.base_iva_21,
      base_exento: acc.base_exento + r.base_exento,
      iva_4: acc.iva_4 + r.iva_4,
      iva_10: acc.iva_10 + r.iva_10,
      iva_21: acc.iva_21 + r.iva_21,
      total: acc.total + r.total,
    }),
    { base_iva_4: 0, base_iva_10: 0, base_iva_21: 0, base_exento: 0, iva_4: 0, iva_10: 0, iva_21: 0, total: 0 }
  );

  return NextResponse.json(successResponse({ rows, totals }));
}
