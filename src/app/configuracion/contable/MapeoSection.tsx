"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Cuenta = { id: string; codigo: string; nombre: string; tipo: string; activo: boolean };
type Config = Record<string, string | null>;

const CAMPOS: Array<{ key: string; label: string; grupo: string; hint?: string }> = [
  { grupo: "Terceros",   key: "cuenta_clientes",           label: "Clientes",              hint: "PGC 430" },
  { grupo: "Terceros",   key: "cuenta_proveedores",        label: "Proveedores",           hint: "PGC 400" },

  { grupo: "Resultado",  key: "cuenta_ventas",             label: "Ventas / Ingresos",     hint: "PGC 700/706" },
  { grupo: "Resultado",  key: "cuenta_compras",            label: "Compras",               hint: "PGC 600" },
  { grupo: "Resultado",  key: "cuenta_gastos",             label: "Gastos generales",      hint: "PGC 621/628/629" },

  { grupo: "IVA repercutido (ventas)", key: "cuenta_iva_repercutido_4",  label: "IVA repercutido 4%",  hint: "PGC 4770" },
  { grupo: "IVA repercutido (ventas)", key: "cuenta_iva_repercutido_10", label: "IVA repercutido 10%", hint: "PGC 4771" },
  { grupo: "IVA repercutido (ventas)", key: "cuenta_iva_repercutido_21", label: "IVA repercutido 21%", hint: "PGC 4772" },

  { grupo: "IVA soportado (compras)",  key: "cuenta_iva_soportado_4",  label: "IVA soportado 4%",  hint: "PGC 4720" },
  { grupo: "IVA soportado (compras)",  key: "cuenta_iva_soportado_10", label: "IVA soportado 10%", hint: "PGC 4721" },
  { grupo: "IVA soportado (compras)",  key: "cuenta_iva_soportado_21", label: "IVA soportado 21%", hint: "PGC 4722" },

  { grupo: "Otros",      key: "cuenta_irpf",  label: "IRPF (retenciones)", hint: "PGC 4751" },
  { grupo: "Tesorería",  key: "cuenta_caja",  label: "Caja",                hint: "PGC 570" },
  { grupo: "Tesorería",  key: "cuenta_banco", label: "Bancos",              hint: "PGC 572" },
];

export default function MapeoSection() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [rC, rCf] = await Promise.all([
        fetchWithSupabaseSession("/api/contabilidad/plan-cuentas"),
        fetchWithSupabaseSession("/api/contabilidad/config"),
      ]);
      const jC = await rC.json(); const jCf = await rCf.json();
      if (jC.success) setCuentas(jC.data?.cuentas ?? []);
      if (jCf.success) setConfig(jCf.data?.config ?? {});
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetchWithSupabaseSession("/api/contabilidad/config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const j = await r.json();
      setMsg(j.success ? "Guardado." : `Error: ${j.error}`);
    } finally { setSaving(false); }
  };

  const setCampo = (key: string, id: string) => setConfig((c) => ({ ...c, [key]: id || null }));

  const cuentasActivas = cuentas.filter((c) => c.activo);
  const grupos = Array.from(new Set(CAMPOS.map((c) => c.grupo)));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <h2 className="text-base font-semibold text-slate-800">4. Mapeo · qué cuenta va con qué operación</h2>
      <p className="text-sm text-slate-600">
        Define qué cuenta contable usar cuando se genera un asiento por venta / compra / gasto / pago.
        El seed inicial ya trae el mapeo default; solo cambiá si querés usar cuentas alternativas del plan.
      </p>

      {msg && <div className={`rounded-lg border px-3 py-2 text-xs ${msg.startsWith("Error") ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{msg}</div>}

      {loading ? (
        <p className="text-sm text-slate-500 py-4">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {grupos.map((grupo) => (
            <div key={grupo}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{grupo}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {CAMPOS.filter((c) => c.grupo === grupo).map((campo) => (
                  <label key={campo.key} className="flex items-center gap-3 text-sm">
                    <span className="w-52 text-slate-700">
                      {campo.label}
                      {campo.hint && <span className="ml-1 text-[10px] text-slate-400">({campo.hint})</span>}
                    </span>
                    <select
                      value={config[campo.key] ?? ""}
                      onChange={(e) => setCampo(campo.key, e.target.value)}
                      className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    >
                      <option value="">— sin asignar —</option>
                      {cuentasActivas.map((c) => (
                        <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div>
            <button onClick={guardar} disabled={saving}
              className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar mapeo"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
