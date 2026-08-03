import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/libro-compras?desde=&hasta=&origen=compra|gasto
 *
 * Unifica compras + gastos con desglose IVA español. Filtro por proveedor y
 * origen opcional.
 */

type Row = {
  id: string;
  origen: "compra" | "gasto";
  fecha: string;
  numero: string;
  proveedor_nombre: string;
  proveedor_nif: string | null;
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

function tasa(tipo: string | null | undefined): number {
  const raw = String(tipo ?? "").trim();
  if (raw === "21%" || raw === "21") return 0.21;
  if (raw === "10%" || raw === "10") return 0.10;
  if (raw === "4%" || raw === "4") return 0.04;
  return 0;
}

function desgloseSimple(total: number, tipoIva: string | null | undefined): {
  base: number; iva: number; tasa: number;
} {
  const t = tasa(tipoIva);
  const base = t > 0 ? total / (1 + t) : total;
  const iva = total - base;
  return { base, iva, tasa: t };
}

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const sp = new URL(request.url).searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  const origen = sp.get("origen"); // 'compra' | 'gasto' | null

  const promises: Array<Promise<Row[]>> = [];

  if (!origen || origen === "compra") {
    promises.push((async () => {
      let q = ctx.supabase
        .from("compras")
        .select("id, fecha, numero_comprobante, total, tipo_iva, proveedor_id, proveedores:proveedor_id(nombre, nif, ruc)")
        .eq("empresa_id", ctx.auth.empresa_id)
        .order("fecha", { ascending: true });
      if (isDate(desde)) q = q.gte("fecha", desde);
      if (isDate(hasta)) q = q.lte("fecha", hasta);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((c: Record<string, unknown>): Row => {
        const total = Number(c.total ?? 0);
        const { base, iva, tasa: t } = desgloseSimple(total, c.tipo_iva as string | null);
        const prov = c.proveedores as { nombre?: string; nif?: string | null; ruc?: string | null } | { nombre?: string; nif?: string | null; ruc?: string | null }[] | null;
        const p = Array.isArray(prov) ? prov[0] : prov;
        return {
          id: String(c.id),
          origen: "compra",
          fecha: String(c.fecha),
          numero: String(c.numero_comprobante ?? ""),
          proveedor_nombre: p?.nombre ?? "—",
          proveedor_nif: p?.nif ?? p?.ruc ?? null,
          base_iva_4:  t === 0.04 ? base : 0,
          base_iva_10: t === 0.10 ? base : 0,
          base_iva_21: t === 0.21 ? base : 0,
          base_exento: t === 0 ? total : 0,
          iva_4:  t === 0.04 ? iva : 0,
          iva_10: t === 0.10 ? iva : 0,
          iva_21: t === 0.21 ? iva : 0,
          total,
        };
      });
    })());
  }

  if (!origen || origen === "gasto") {
    promises.push((async () => {
      let q = ctx.supabase
        .from("gastos")
        .select("id, fecha, descripcion, total, tipo_iva, proveedor_nombre")
        .eq("empresa_id", ctx.auth.empresa_id)
        .order("fecha", { ascending: true });
      if (isDate(desde)) q = q.gte("fecha", desde);
      if (isDate(hasta)) q = q.lte("fecha", hasta);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((g: Record<string, unknown>): Row => {
        const total = Number(g.total ?? 0);
        const { base, iva, tasa: t } = desgloseSimple(total, g.tipo_iva as string | null);
        return {
          id: String(g.id),
          origen: "gasto",
          fecha: String(g.fecha),
          numero: String(g.descripcion ?? "").slice(0, 30),
          proveedor_nombre: String(g.proveedor_nombre ?? "—"),
          proveedor_nif: null,
          base_iva_4:  t === 0.04 ? base : 0,
          base_iva_10: t === 0.10 ? base : 0,
          base_iva_21: t === 0.21 ? base : 0,
          base_exento: t === 0 ? total : 0,
          iva_4:  t === 0.04 ? iva : 0,
          iva_10: t === 0.10 ? iva : 0,
          iva_21: t === 0.21 ? iva : 0,
          total,
        };
      });
    })());
  }

  try {
    const results = await Promise.all(promises);
    const rows = results.flat().sort((a, b) => a.fecha.localeCompare(b.fecha));
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
