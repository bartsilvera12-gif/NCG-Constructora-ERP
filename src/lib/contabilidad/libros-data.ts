/**
 * Consultas puras de los libros contables. Se comparten entre los endpoints
 * de listado JSON y los de export XLSX.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

// ── util ────────────────────────────────────────────────────────────────────
function isDate(s: string | null | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function tasa(tipo: string | null | undefined): number {
  const raw = String(tipo ?? "").trim();
  if (raw === "21%" || raw === "21") return 0.21;
  if (raw === "10%" || raw === "10") return 0.10;
  if (raw === "4%"  || raw === "4")  return 0.04;
  return 0;
}
function desgloseSimple(total: number, tipoIva: string | null | undefined) {
  const t = tasa(tipoIva);
  const base = t > 0 ? total / (1 + t) : total;
  const iva = total - base;
  return { base, iva, tasa: t };
}

// ── Libro de Ventas ─────────────────────────────────────────────────────────
export type LibroVentasRow = {
  id: string; fecha: string; numero: string;
  cliente_nombre: string; cliente_nif: string | null;
  base_iva_4: number; base_iva_10: number; base_iva_21: number; base_exento: number;
  iva_4: number; iva_10: number; iva_21: number; total: number;
};
export type LibroVentasTotals = Omit<LibroVentasRow, "id" | "fecha" | "numero" | "cliente_nombre" | "cliente_nif">;

export async function fetchLibroVentas(
  sb: AppSupabaseClient, empresaId: string, opts: { desde?: string | null; hasta?: string | null }
): Promise<{ rows: LibroVentasRow[]; totals: LibroVentasTotals }> {
  let q = sb
    .from("ventas")
    .select("id, numero_control, fecha, total, cliente_id, clientes:cliente_id(empresa, nombre_contacto, ruc)")
    .eq("empresa_id", empresaId)
    .eq("tipo_documento", "venta")
    .order("fecha", { ascending: true });
  if (isDate(opts.desde)) q = q.gte("fecha", opts.desde);
  if (isDate(opts.hasta)) q = q.lte("fecha", opts.hasta);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const ventaIds = (data ?? []).map((r: { id: string }) => r.id);
  const itemsMap = new Map<string, Array<{ tipo_iva: string | null; total_linea: number }>>();
  if (ventaIds.length > 0) {
    const iQ = await sb
      .from("ventas_items")
      .select("venta_id, tipo_iva, total_linea")
      .eq("empresa_id", empresaId)
      .in("venta_id", ventaIds);
    for (const it of (iQ.data ?? []) as Array<{ venta_id: string; tipo_iva: string | null; total_linea: number }>) {
      const arr = itemsMap.get(it.venta_id) ?? [];
      arr.push({ tipo_iva: it.tipo_iva, total_linea: Number(it.total_linea) });
      itemsMap.set(it.venta_id, arr);
    }
  }

  const rows: LibroVentasRow[] = (data ?? []).map((v: Record<string, unknown>) => {
    const items = itemsMap.get(String(v.id)) ?? [];
    const bk = { b4: 0, b10: 0, b21: 0, bex: 0, i4: 0, i10: 0, i21: 0 };
    for (const it of items) {
      const t = tasa(it.tipo_iva);
      const totLinea = it.total_linea;
      const base = t > 0 ? totLinea / (1 + t) : totLinea;
      const iva = totLinea - base;
      if (t === 0.04) { bk.b4 += base; bk.i4 += iva; }
      else if (t === 0.10) { bk.b10 += base; bk.i10 += iva; }
      else if (t === 0.21) { bk.b21 += base; bk.i21 += iva; }
      else bk.bex += totLinea;
    }
    const cli = v.clientes as { empresa?: string; nombre_contacto?: string; ruc?: string | null } | { empresa?: string; nombre_contacto?: string; ruc?: string | null }[] | null;
    const c = Array.isArray(cli) ? cli[0] : cli;
    return {
      id: String(v.id), fecha: String(v.fecha), numero: String(v.numero_control ?? ""),
      cliente_nombre: c?.empresa?.trim() || c?.nombre_contacto?.trim() || "—",
      cliente_nif: c?.ruc ?? null,
      base_iva_4: bk.b4, base_iva_10: bk.b10, base_iva_21: bk.b21, base_exento: bk.bex,
      iva_4: bk.i4, iva_10: bk.i10, iva_21: bk.i21, total: Number(v.total ?? 0),
    };
  });
  const totals = rows.reduce((a, r) => ({
    base_iva_4: a.base_iva_4 + r.base_iva_4,
    base_iva_10: a.base_iva_10 + r.base_iva_10,
    base_iva_21: a.base_iva_21 + r.base_iva_21,
    base_exento: a.base_exento + r.base_exento,
    iva_4: a.iva_4 + r.iva_4, iva_10: a.iva_10 + r.iva_10, iva_21: a.iva_21 + r.iva_21,
    total: a.total + r.total,
  }), { base_iva_4: 0, base_iva_10: 0, base_iva_21: 0, base_exento: 0, iva_4: 0, iva_10: 0, iva_21: 0, total: 0 });
  return { rows, totals };
}

// ── Libro de Compras ────────────────────────────────────────────────────────
export type LibroComprasRow = {
  id: string; origen: "compra" | "gasto"; fecha: string; numero: string;
  proveedor_nombre: string; proveedor_nif: string | null;
  base_iva_4: number; base_iva_10: number; base_iva_21: number; base_exento: number;
  iva_4: number; iva_10: number; iva_21: number; total: number;
};
export type LibroComprasTotals = Omit<LibroComprasRow, "id" | "origen" | "fecha" | "numero" | "proveedor_nombre" | "proveedor_nif">;

export async function fetchLibroCompras(
  sb: AppSupabaseClient, empresaId: string, opts: { desde?: string | null; hasta?: string | null; origen?: string | null }
): Promise<{ rows: LibroComprasRow[]; totals: LibroComprasTotals }> {
  const rows: LibroComprasRow[] = [];
  const inclCompras = !opts.origen || opts.origen === "compra";
  const inclGastos = !opts.origen || opts.origen === "gasto";

  if (inclCompras) {
    let q = sb
      .from("compras")
      .select("id, fecha, numero_comprobante, total, tipo_iva, proveedor_id, proveedores:proveedor_id(nombre, nif, ruc)")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: true });
    if (isDate(opts.desde)) q = q.gte("fecha", opts.desde);
    if (isDate(opts.hasta)) q = q.lte("fecha", opts.hasta);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as Array<Record<string, unknown>>) {
      const total = Number(c.total ?? 0);
      const { base, iva, tasa: t } = desgloseSimple(total, c.tipo_iva as string | null);
      const prov = c.proveedores as { nombre?: string; nif?: string | null; ruc?: string | null } | { nombre?: string; nif?: string | null; ruc?: string | null }[] | null;
      const p = Array.isArray(prov) ? prov[0] : prov;
      rows.push({
        id: String(c.id), origen: "compra",
        fecha: String(c.fecha), numero: String(c.numero_comprobante ?? ""),
        proveedor_nombre: p?.nombre ?? "—",
        proveedor_nif: p?.nif ?? p?.ruc ?? null,
        base_iva_4:  t === 0.04 ? base : 0, base_iva_10: t === 0.10 ? base : 0,
        base_iva_21: t === 0.21 ? base : 0, base_exento: t === 0 ? total : 0,
        iva_4:  t === 0.04 ? iva : 0, iva_10: t === 0.10 ? iva : 0, iva_21: t === 0.21 ? iva : 0,
        total,
      });
    }
  }
  if (inclGastos) {
    let q = sb
      .from("gastos")
      .select("id, fecha, descripcion, total, tipo_iva, proveedor_nombre")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: true });
    if (isDate(opts.desde)) q = q.gte("fecha", opts.desde);
    if (isDate(opts.hasta)) q = q.lte("fecha", opts.hasta);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const g of (data ?? []) as Array<Record<string, unknown>>) {
      const total = Number(g.total ?? 0);
      const { base, iva, tasa: t } = desgloseSimple(total, g.tipo_iva as string | null);
      rows.push({
        id: String(g.id), origen: "gasto",
        fecha: String(g.fecha), numero: String(g.descripcion ?? "").slice(0, 30),
        proveedor_nombre: String(g.proveedor_nombre ?? "—"),
        proveedor_nif: null,
        base_iva_4:  t === 0.04 ? base : 0, base_iva_10: t === 0.10 ? base : 0,
        base_iva_21: t === 0.21 ? base : 0, base_exento: t === 0 ? total : 0,
        iva_4:  t === 0.04 ? iva : 0, iva_10: t === 0.10 ? iva : 0, iva_21: t === 0.21 ? iva : 0,
        total,
      });
    }
  }
  rows.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const totals = rows.reduce((a, r) => ({
    base_iva_4: a.base_iva_4 + r.base_iva_4,
    base_iva_10: a.base_iva_10 + r.base_iva_10,
    base_iva_21: a.base_iva_21 + r.base_iva_21,
    base_exento: a.base_exento + r.base_exento,
    iva_4: a.iva_4 + r.iva_4, iva_10: a.iva_10 + r.iva_10, iva_21: a.iva_21 + r.iva_21,
    total: a.total + r.total,
  }), { base_iva_4: 0, base_iva_10: 0, base_iva_21: 0, base_exento: 0, iva_4: 0, iva_10: 0, iva_21: 0, total: 0 });
  return { rows, totals };
}

// ── Libro Diario ────────────────────────────────────────────────────────────
export type DiarioLinea = {
  cuenta_codigo: string; cuenta_nombre: string;
  descripcion: string | null; debe: number; haber: number;
};
export type DiarioAsiento = {
  id: string; numero: string; fecha: string; concepto: string;
  origen_tipo: string | null; origen_id: string | null;
  lineas: DiarioLinea[]; total_debe: number; total_haber: number;
};

export async function fetchLibroDiario(
  sb: AppSupabaseClient, empresaId: string, opts: { desde?: string | null; hasta?: string | null }
): Promise<{ asientos: DiarioAsiento[]; totals: { debe: number; haber: number } }> {
  let q = sb
    .from("asientos_contables")
    .select("id, numero, fecha, concepto, origen_tipo, origen_id, anulado, lineas:asientos_lineas(id, cuenta_id, debe, haber, descripcion, orden, cuenta:plan_cuentas(codigo, nombre))")
    .eq("empresa_id", empresaId)
    .eq("anulado", false)
    .order("fecha", { ascending: true })
    .order("numero", { ascending: true });
  if (isDate(opts.desde)) q = q.gte("fecha", opts.desde);
  if (isDate(opts.hasta)) q = q.lte("fecha", opts.hasta);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const asientos: DiarioAsiento[] = (data ?? []).map((a: Record<string, unknown>) => {
    const lineas = ((a.lineas ?? []) as Array<Record<string, unknown>>)
      .sort((x, y) => Number(x.orden ?? 0) - Number(y.orden ?? 0))
      .map((l) => {
        const c = l.cuenta as { codigo?: string; nombre?: string } | { codigo?: string; nombre?: string }[] | null;
        const cc = Array.isArray(c) ? c[0] : c;
        return {
          cuenta_codigo: cc?.codigo ?? "?", cuenta_nombre: cc?.nombre ?? "?",
          descripcion: (l.descripcion as string | null) ?? null,
          debe: Number(l.debe ?? 0), haber: Number(l.haber ?? 0),
        };
      });
    return {
      id: String(a.id), numero: String(a.numero), fecha: String(a.fecha),
      concepto: String(a.concepto ?? ""),
      origen_tipo: (a.origen_tipo as string) ?? null,
      origen_id: (a.origen_id as string) ?? null,
      lineas,
      total_debe: lineas.reduce((s, l) => s + l.debe, 0),
      total_haber: lineas.reduce((s, l) => s + l.haber, 0),
    };
  });
  const totals = asientos.reduce((a, x) => ({ debe: a.debe + x.total_debe, haber: a.haber + x.total_haber }), { debe: 0, haber: 0 });
  return { asientos, totals };
}
