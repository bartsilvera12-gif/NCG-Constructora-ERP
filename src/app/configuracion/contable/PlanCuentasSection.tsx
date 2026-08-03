"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Cuenta = { id: string; codigo: string; nombre: string; tipo: string; activo: boolean };
const TIPOS = ["activo", "pasivo", "patrimonio", "ingreso", "gasto", "orden"] as const;

const INPUT = "rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm";

export default function PlanCuentasSection({ onChange }: { onChange?: () => void }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [nueva, setNueva] = useState({ codigo: "", nombre: "", tipo: "activo" as (typeof TIPOS)[number] });
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchWithSupabaseSession("/api/contabilidad/plan-cuentas");
      const j = await r.json();
      if (j.success) setCuentas(j.data?.cuentas ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const crear = async () => {
    setMsg(null);
    if (!nueva.codigo.trim() || !nueva.nombre.trim()) {
      setMsg("Código y nombre son requeridos."); return;
    }
    const r = await fetchWithSupabaseSession("/api/contabilidad/plan-cuentas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nueva),
    });
    const j = await r.json();
    if (!j.success) { setMsg(j.error ?? "Error"); return; }
    setNueva({ codigo: "", nombre: "", tipo: "activo" });
    void cargar(); onChange?.();
  };

  const patch = async (id: string, patchBody: Partial<Cuenta>) => {
    const r = await fetchWithSupabaseSession("/api/contabilidad/plan-cuentas", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patchBody }),
    });
    const j = await r.json();
    if (!j.success) { setMsg(j.error ?? "Error al actualizar"); return; }
    void cargar();
  };

  const borrar = async (c: Cuenta) => {
    if (!window.confirm(`¿Eliminar cuenta ${c.codigo} · ${c.nombre}? Falla si está en uso por asientos o mapeo.`)) return;
    const r = await fetchWithSupabaseSession(`/api/contabilidad/plan-cuentas?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.success) { setMsg(j.error ?? "Error al eliminar"); return; }
    void cargar(); onChange?.();
  };

  const filtradas = cuentas.filter((c) =>
    !filtro || c.codigo.includes(filtro) || c.nombre.toLowerCase().includes(filtro.toLowerCase()) || c.tipo === filtro.toLowerCase()
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-800">3. Plan de cuentas</h2>
        <input placeholder="Buscar código / nombre / tipo…" value={filtro} onChange={(e) => setFiltro(e.target.value)}
          className={`${INPUT} w-64`} />
      </div>
      {msg && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{msg}</div>}

      {/* Alta rápida */}
      <div className="grid grid-cols-[100px_1fr_140px_auto] gap-2 items-center">
        <input placeholder="Código" value={nueva.codigo} onChange={(e) => setNueva((n) => ({ ...n, codigo: e.target.value }))} className={INPUT} />
        <input placeholder="Nombre de la cuenta" value={nueva.nombre} onChange={(e) => setNueva((n) => ({ ...n, nombre: e.target.value }))} className={INPUT} />
        <select value={nueva.tipo} onChange={(e) => setNueva((n) => ({ ...n, tipo: e.target.value as (typeof TIPOS)[number] }))} className={INPUT}>
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={crear}
          className="rounded-md bg-[#4FAEB2] hover:bg-[#3F8E91] px-3 py-1 text-sm font-medium text-white">
          Agregar
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 py-4">Cargando…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">Sin cuentas cargadas. Corré "Sembrar" arriba para cargar el PGC ES base.</p>
      ) : (
        <div className="overflow-x-auto max-h-[500px] rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 w-20">Código</th>
                <th className="text-left px-3 py-2">Nombre</th>
                <th className="text-left px-3 py-2 w-28">Tipo</th>
                <th className="text-center px-3 py-2 w-20">Activa</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-mono text-xs">{c.codigo}</td>
                  <td className="px-3 py-1.5">
                    <input defaultValue={c.nombre} onBlur={(e) => e.target.value !== c.nombre && patch(c.id, { nombre: e.target.value })}
                      className="w-full bg-transparent focus:bg-white focus:border focus:border-slate-200 rounded px-1 text-sm" />
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={c.tipo} onChange={(e) => patch(c.id, { tipo: e.target.value })} className="text-xs bg-transparent">
                      {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input type="checkbox" checked={c.activo} onChange={(e) => patch(c.id, { activo: e.target.checked })} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => borrar(c)} className="text-xs text-rose-600 hover:text-rose-700">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Los cambios en <strong>Nombre</strong> se guardan al salir del campo. El código no se puede modificar (crear una cuenta nueva y desactivar la vieja).
      </p>
    </section>
  );
}
