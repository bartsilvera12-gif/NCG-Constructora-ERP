"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type BackfillResult = {
  ventas: { ok: number; error: number; mensajes: string[] };
  compras: { ok: number; error: number; mensajes: string[] };
  gastos: { ok: number; error: number; mensajes: string[] };
};

export default function ContableAdminPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [backfillRes, setBackfillRes] = useState<BackfillResult | null>(null);
  const [tipoBackfill, setTipoBackfill] = useState<"todo" | "ventas" | "compras" | "gastos">("todo");

  async function seed() {
    setBusy("seed"); setMsg(null); setBackfillRes(null);
    try {
      const r = await fetchWithSupabaseSession("/api/contabilidad/seed", { method: "POST" });
      const j = await r.json();
      setMsg(j.success ? `Sembrado plan de cuentas · ${j.data?.cuentas ?? 0} cuentas.` : `Error: ${j.error}`);
    } finally { setBusy(null); }
  }

  async function backfill() {
    setBusy("backfill"); setMsg(null); setBackfillRes(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/contabilidad/backfill?tipo=${tipoBackfill}`, { method: "POST" });
      const j = await r.json();
      if (j.success) {
        setBackfillRes(j.data);
        setMsg("Backfill terminado. Revisar resultados abajo.");
      } else {
        setMsg(`Error: ${j.error}`);
      }
    } finally { setBusy(null); }
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <PageHeader
        eyebrow="NCG · Configuración"
        title="Contabilidad — Administración"
        description="Sembrar plan de cuentas base y generar asientos históricos desde ventas / compras / gastos existentes."
      />

      {msg && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {msg}
        </div>
      )}

      {/* Seed */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-800">1. Plan de cuentas</h2>
        <p className="text-sm text-slate-600">
          Siembra el plan contable ES base (34 cuentas del PGC PYMEs simplificado) y la configuración
          por defecto (qué cuenta va con qué tipo de IVA, IRPF, tesorería). Idempotente: se puede correr
          varias veces sin duplicar.
        </p>
        <button onClick={seed} disabled={busy !== null}
          className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#3F8E91]">
          {busy === "seed" ? "Sembrando…" : "Sembrar plan de cuentas"}
        </button>
      </section>

      {/* Backfill */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-800">2. Backfill de asientos históricos</h2>
        <p className="text-sm text-slate-600">
          Barre todas las ventas / compras / gastos existentes en la base y genera el asiento contable
          correspondiente. Idempotente: si un movimiento ya tiene asiento, lo regenera.
        </p>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600">Tipo:</label>
          <select value={tipoBackfill} onChange={(e) => setTipoBackfill(e.target.value as "todo" | "ventas" | "compras" | "gastos")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="todo">Todo</option>
            <option value="ventas">Solo ventas</option>
            <option value="compras">Solo compras</option>
            <option value="gastos">Solo gastos</option>
          </select>
          <button onClick={backfill} disabled={busy !== null}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#3F8E91]">
            {busy === "backfill" ? "Procesando…" : "Generar asientos"}
          </button>
        </div>
      </section>

      {backfillRes && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h3 className="text-base font-semibold text-slate-800">Resultado</h3>
          {(["ventas", "compras", "gastos"] as const).map((k) => {
            const r = backfillRes[k];
            if (r.ok === 0 && r.error === 0) return null;
            return (
              <div key={k} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                <p className="text-sm font-medium capitalize">{k}</p>
                <p className="text-xs text-slate-600">
                  <span className="text-emerald-700">{r.ok} OK</span>
                  {r.error > 0 && <> · <span className="text-rose-700">{r.error} con error</span></>}
                </p>
                {r.mensajes.length > 0 && (
                  <ul className="mt-2 text-xs text-rose-600 space-y-0.5 max-h-40 overflow-y-auto">
                    {r.mensajes.slice(0, 20).map((m, i) => <li key={i}>· {m}</li>)}
                    {r.mensajes.length > 20 && <li>… y {r.mensajes.length - 20} más.</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
