"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const dynamic = "force-dynamic";

type Bucket = {
  tipo: string;
  label: string;
  presupuestos: number;
  ventas: number;
  convertidos: number;
  total: number;
};

type Data = {
  items: Bucket[];
  resumen: { total_registros: number; total_facturado: number; tipos_distintos: number };
  desde: string | null;
  hasta: string | null;
};

const inputCls = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";

function fmtEur(n: number): string {
  return `€ ${n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Default: ultimos 90 dias.
function defaultRange(): { desde: string; hasta: string } {
  const hoy = new Date();
  const desde = new Date();
  desde.setDate(hoy.getDate() - 90);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: fmt(desde), hasta: fmt(hoy) };
}

export default function TiposTrabajoPage() {
  const initial = useMemo(defaultRange, []);
  const [desde, setDesde] = useState(initial.desde);
  const [hasta, setHasta] = useState(initial.hasta);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sp = new URLSearchParams({ desde, hasta });
    fetchWithSupabaseSession(`/api/reportes/tipos-trabajo?${sp}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && j.success && j.data) { setData(j.data); setErr(null); }
        else setErr(j.error ?? "No se pudo cargar");
      })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : "Error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [desde, hasta]);

  const items = data?.items ?? [];
  const maxCount = items.reduce((m, b) => Math.max(m, b.presupuestos + b.ventas), 0) || 1;
  const totalCount = items.reduce((s, b) => s + b.presupuestos + b.ventas, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="NCG · Reportes"
        title="Tipos de trabajo"
        description="Cuáles son los tipos de obra/servicio más solicitados según presupuestos y ventas."
        backHref="/reportes"
        backLabel="Reportes"
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        </div>
        <div className="ml-auto flex gap-6 text-sm">
          <Kpi label="Registros" value={String(data?.resumen.total_registros ?? 0)} />
          <Kpi label="Tipos distintos" value={String(data?.resumen.tipos_distintos ?? 0)} />
          <Kpi label="Facturado" value={fmtEur(data?.resumen.total_facturado ?? 0)} />
        </div>
      </div>

      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Tipo de trabajo</th>
              <th className="px-4 py-3 text-right">Presupuestos</th>
              <th className="px-4 py-3 text-right">Aprobados</th>
              <th className="px-4 py-3 text-right">Ventas</th>
              <th className="px-4 py-3 text-right">Total facturado</th>
              <th className="px-4 py-3 w-[28%]">Volumen</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">Sin datos en el rango seleccionado.</td></tr>
            ) : (
              items.map((b, i) => {
                const cnt = b.presupuestos + b.ventas;
                const pct = (cnt / maxCount) * 100;
                const pctTotal = totalCount > 0 ? (cnt / totalCount) * 100 : 0;
                return (
                  <tr key={b.tipo} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {i + 1}
                        </span>
                        <div>
                          <div className="font-medium text-slate-800">{b.label}</div>
                          <div className="text-xs text-slate-400">{pctTotal.toFixed(1)}% del total</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{b.presupuestos}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-medium">{b.convertidos}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{b.ventas}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{fmtEur(b.total)}</td>
                    <td className="px-4 py-3">
                      <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#4FAEB2] to-[#0EA5E9]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-slate-800">{value}</p>
    </div>
  );
}
