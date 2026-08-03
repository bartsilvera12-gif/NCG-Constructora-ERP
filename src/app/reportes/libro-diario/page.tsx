"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FiltrosFecha, firstOfMonth, todayIso, formatEur, DescargarExcelBtn } from "@/components/reportes/FiltrosFecha";

type Linea = { cuenta_codigo: string; cuenta_nombre: string; descripcion: string | null; debe: number; haber: number };
type Asiento = {
  id: string; numero: string; fecha: string; concepto: string;
  origen_tipo: string | null; origen_id: string | null;
  lineas: Linea[]; total_debe: number; total_haber: number;
};

export default function LibroDiarioPage() {
  const [desde, setDesde] = useState(firstOfMonth());
  const [hasta, setHasta] = useState(todayIso());
  const [asientos, setAsientos] = useState<Asiento[]>([]);
  const [totals, setTotals] = useState<{ debe: number; haber: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/reportes/libro-diario?desde=${desde}&hasta=${hasta}`);
      const j = await r.json();
      if (j.success) { setAsientos(j.data?.asientos ?? []); setTotals(j.data?.totals ?? null); }
    } finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="NCG · Contabilidad"
        title="Libro Diario"
        description="Registro cronológico de asientos contables generados automáticamente desde ventas, compras, gastos y pagos."
        backHref="/reportes"
        backLabel="Reportes"
      />
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <FiltrosFecha desde={desde} hasta={hasta} onChange={(v) => { if (v.desde !== undefined) setDesde(v.desde); if (v.hasta !== undefined) setHasta(v.hasta); }} />
        <DescargarExcelBtn href={`/api/reportes/libro-diario/export?desde=${desde}&hasta=${hasta}`} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-slate-400 text-sm">Cargando…</p>
        ) : asientos.length === 0 ? (
          <div className="p-8 text-center text-sm">
            <p className="text-slate-400">Sin asientos en el rango.</p>
            <p className="mt-2 text-xs text-slate-500">Los asientos se generan automáticamente cuando registrás ventas, compras, gastos o pagos. Verificá que la contabilidad esté configurada.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {asientos.map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs font-mono text-slate-500">{a.numero}</span>
                    <span className="text-sm font-medium">{a.fecha}</span>
                    <span className="text-sm text-slate-700">{a.concepto}</span>
                    {a.origen_tipo && (
                      <span className="text-[10px] uppercase font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{a.origen_tipo}</span>
                    )}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr>
                      <th className="py-1 text-left w-16">Cuenta</th>
                      <th className="py-1 text-left">Nombre</th>
                      <th className="py-1 text-left">Descripción</th>
                      <th className="py-1 text-right w-24">Debe</th>
                      <th className="py-1 text-right w-24">Haber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {a.lineas.map((l, i) => (
                      <tr key={i}>
                        <td className="py-1 font-mono text-xs">{l.cuenta_codigo}</td>
                        <td className="py-1">{l.cuenta_nombre}</td>
                        <td className="py-1 text-slate-500 text-xs">{l.descripcion ?? ""}</td>
                        <td className="py-1 text-right tabular-nums">{l.debe ? formatEur(l.debe) : ""}</td>
                        <td className="py-1 text-right tabular-nums">{l.haber ? formatEur(l.haber) : ""}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 font-semibold">
                      <td colSpan={3} className="py-1 text-right text-xs uppercase text-slate-500">Sumas</td>
                      <td className="py-1 text-right tabular-nums">{formatEur(a.total_debe)}</td>
                      <td className="py-1 text-right tabular-nums">{formatEur(a.total_haber)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            {totals && (
              <div className="bg-[#E5F4F4] px-4 py-3 flex items-center justify-between text-sm font-semibold">
                <span>Totales del período</span>
                <span className="flex gap-6">
                  <span>Debe: <span className="tabular-nums">{formatEur(totals.debe)}</span></span>
                  <span>Haber: <span className="tabular-nums">{formatEur(totals.haber)}</span></span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
