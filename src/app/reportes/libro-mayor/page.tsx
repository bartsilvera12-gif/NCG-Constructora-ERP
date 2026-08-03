"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FiltrosFecha, firstOfMonth, todayIso, formatEur, DescargarExcelBtn } from "@/components/reportes/FiltrosFecha";

type ResumenRow = { cuenta_id: string; codigo: string; nombre: string; tipo: string; saldo_inicial: number; debe_periodo: number; haber_periodo: number; saldo_final: number };
type Movimiento = { fecha: string; numero: string; concepto: string; descripcion: string | null; debe: number; haber: number; saldo: number };

export default function LibroMayorPage() {
  const [desde, setDesde] = useState(firstOfMonth());
  const [hasta, setHasta] = useState(todayIso());
  const [cuentaSel, setCuentaSel] = useState<{ id: string; codigo: string; nombre: string } | null>(null);
  const [resumen, setResumen] = useState<ResumenRow[]>([]);
  const [detalle, setDetalle] = useState<{ movimientos: Movimiento[]; saldo_inicial: number; saldo_final: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const url = cuentaSel
        ? `/api/reportes/libro-mayor?desde=${desde}&hasta=${hasta}&cuenta_id=${cuentaSel.id}`
        : `/api/reportes/libro-mayor?desde=${desde}&hasta=${hasta}`;
      const r = await fetchWithSupabaseSession(url);
      const j = await r.json();
      if (j.success) {
        if (j.data?.modo === "detalle") setDetalle({ movimientos: j.data.movimientos ?? [], saldo_inicial: j.data.saldo_inicial ?? 0, saldo_final: j.data.saldo_final ?? 0 });
        else { setResumen(j.data?.cuentas ?? []); setDetalle(null); }
      }
    } finally { setLoading(false); }
  }, [desde, hasta, cuentaSel]);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="NCG · Contabilidad"
        title="Libro Mayor"
        description="Movimientos y saldos acumulados por cuenta contable. Click en una cuenta para ver el detalle."
        backHref="/reportes"
        backLabel="Reportes"
      />
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <FiltrosFecha desde={desde} hasta={hasta} onChange={(v) => { if (v.desde !== undefined) setDesde(v.desde); if (v.hasta !== undefined) setHasta(v.hasta); }}
          extra={cuentaSel && (
            <button type="button" onClick={() => setCuentaSel(null)} className="text-xs rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
              ← Volver al resumen
            </button>
          )}
        />
        <DescargarExcelBtn href={`/api/reportes/libro-mayor/export?desde=${desde}&hasta=${hasta}${cuentaSel ? `&cuenta_id=${cuentaSel.id}` : ""}`} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-slate-400 text-sm">Cargando…</p>
        ) : cuentaSel && detalle ? (
          <div className="p-4">
            <h3 className="text-base font-semibold mb-3">
              <span className="font-mono text-sm text-slate-500 mr-2">{cuentaSel.codigo}</span>
              {cuentaSel.nombre}
            </h3>
            <div className="mb-3 flex justify-between text-sm">
              <span>Saldo inicial: <strong className="tabular-nums">{formatEur(detalle.saldo_inicial)}</strong></span>
              <span>Saldo final: <strong className="tabular-nums">{formatEur(detalle.saldo_final)}</strong></span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Asiento</th>
                  <th className="px-3 py-2 text-left">Concepto</th>
                  <th className="px-3 py-2 text-right">Debe</th>
                  <th className="px-3 py-2 text-right">Haber</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detalle.movimientos.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400 text-sm">Sin movimientos.</td></tr>
                ) : detalle.movimientos.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 tabular-nums">{m.fecha}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{m.numero}</td>
                    <td className="px-3 py-1.5 text-xs">{m.concepto}{m.descripcion ? ` · ${m.descripcion}` : ""}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.debe ? formatEur(m.debe) : ""}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.haber ? formatEur(m.haber) : ""}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatEur(m.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : resumen.length === 0 ? (
          <div className="p-8 text-center text-sm">
            <p className="text-slate-400">Sin movimientos contables en el rango.</p>
            <p className="mt-2 text-xs text-slate-500">El Libro Mayor se pobla a partir del Libro Diario. Verificá que haya asientos generados.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left w-20">Cuenta</th>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-left w-24">Tipo</th>
                <th className="px-3 py-2 text-right">Saldo inicial</th>
                <th className="px-3 py-2 text-right">Debe</th>
                <th className="px-3 py-2 text-right">Haber</th>
                <th className="px-3 py-2 text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resumen.map((c) => (
                <tr key={c.cuenta_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setCuentaSel({ id: c.cuenta_id, codigo: c.codigo, nombre: c.nombre })}>
                  <td className="px-3 py-2 font-mono text-xs">{c.codigo}</td>
                  <td className="px-3 py-2 text-[#3F8E91] hover:underline">{c.nombre}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 capitalize">{c.tipo}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatEur(c.saldo_inicial)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(c.debe_periodo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEur(c.haber_periodo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatEur(c.saldo_final)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
