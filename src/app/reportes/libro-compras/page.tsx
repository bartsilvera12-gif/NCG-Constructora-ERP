"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FiltrosFecha, firstOfMonth, todayIso, formatEur, DescargarExcelBtn } from "@/components/reportes/FiltrosFecha";

type Row = {
  id: string; origen: "compra" | "gasto"; fecha: string; numero: string;
  proveedor_nombre: string; proveedor_nif: string | null;
  base_iva_4: number; base_iva_10: number; base_iva_21: number; base_exento: number;
  iva_4: number; iva_10: number; iva_21: number; total: number;
};
type Totals = Omit<Row, "id" | "origen" | "fecha" | "numero" | "proveedor_nombre" | "proveedor_nif">;

export default function LibroComprasPage() {
  const [desde, setDesde] = useState(firstOfMonth());
  const [hasta, setHasta] = useState(todayIso());
  const [origen, setOrigen] = useState<"all" | "compra" | "gasto">("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const oQ = origen !== "all" ? `&origen=${origen}` : "";
      const r = await fetchWithSupabaseSession(`/api/reportes/libro-compras?desde=${desde}&hasta=${hasta}${oQ}`);
      const j = await r.json();
      if (j.success) { setRows(j.data?.rows ?? []); setTotals(j.data?.totals ?? null); }
    } finally { setLoading(false); }
  }, [desde, hasta, origen]);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="NCG · Contabilidad"
        title="Libro de Compras"
        description="Registro fiscal unificado: compras + gastos con IVA desglosado (4/10/21%)."
        backHref="/reportes"
        backLabel="Reportes"
      />
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <FiltrosFecha desde={desde} hasta={hasta} onChange={(v) => { if (v.desde !== undefined) setDesde(v.desde); if (v.hasta !== undefined) setHasta(v.hasta); }}
          extra={
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Origen
              <select value={origen} onChange={(e) => setOrigen(e.target.value as "all" | "compra" | "gasto")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
                <option value="all">Todos</option>
                <option value="compra">Compras</option>
                <option value="gasto">Gastos</option>
              </select>
            </label>
          }
        />
        <DescargarExcelBtn href={`/api/reportes/libro-compras/export?desde=${desde}&hasta=${hasta}${origen !== "all" ? `&origen=${origen}` : ""}`} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Origen</th>
                <th className="px-3 py-2 text-left">Nº / Descripción</th>
                <th className="px-3 py-2 text-left">Proveedor</th>
                <th className="px-3 py-2 text-left">NIF</th>
                <th className="px-3 py-2 text-right">Base 4%</th>
                <th className="px-3 py-2 text-right">Base 10%</th>
                <th className="px-3 py-2 text-right">Base 21%</th>
                <th className="px-3 py-2 text-right">Exento</th>
                <th className="px-3 py-2 text-right">IVA 4%</th>
                <th className="px-3 py-2 text-right">IVA 10%</th>
                <th className="px-3 py-2 text-right">IVA 21%</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={13} className="py-8 text-center text-slate-400 text-sm">Cargando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={13} className="py-8 text-center text-slate-400 text-sm">Sin movimientos en el rango.</td></tr>
              ) : rows.map((r) => (
                <tr key={`${r.origen}-${r.id}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 tabular-nums">{r.fecha}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`inline-block rounded px-1.5 py-0.5 font-medium ${r.origen === "compra" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                      {r.origen}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.numero}</td>
                  <td className="px-3 py-2">{r.proveedor_nombre}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{r.proveedor_nif ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.base_iva_4 ? formatEur(r.base_iva_4) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.base_iva_10 ? formatEur(r.base_iva_10) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.base_iva_21 ? formatEur(r.base_iva_21) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.base_exento ? formatEur(r.base_exento) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.iva_4 ? formatEur(r.iva_4) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.iva_10 ? formatEur(r.iva_10) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.iva_21 ? formatEur(r.iva_21) : ""}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEur(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {totals && rows.length > 0 && (
              <tfoot className="bg-[#E5F4F4] text-slate-800 font-semibold">
                <tr>
                  <td colSpan={5} className="px-3 py-2">TOTALES</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(totals.base_iva_4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(totals.base_iva_10)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(totals.base_iva_21)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(totals.base_exento)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(totals.iva_4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(totals.iva_10)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(totals.iva_21)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
