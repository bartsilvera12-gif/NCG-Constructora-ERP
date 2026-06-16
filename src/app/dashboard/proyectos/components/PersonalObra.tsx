"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Empleado = { id: string; nombre: string; cargo: string | null; costo_hora: number };

type Asignacion = {
  id: string;
  empleado_id: string;
  empleado_nombre: string | null;
  empleado_cargo: string | null;
  fecha: string;
  horas: number;
  costo_total: number;
  observacion: string | null;
};

function fmtGs(n: number): string {
  return `€ ${n.toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PY");
  } catch {
    return iso;
  }
}

export default function PersonalObra({ projectId }: { projectId: string }) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    empleado_id: "",
    fecha: new Date().toISOString().slice(0, 10),
    horas: "",
    costo_total: "",
    observacion: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [rE, rA] = await Promise.all([
        fetchWithSupabaseSession("/api/rrhh/empleados", { cache: "no-store" }),
        fetchWithSupabaseSession(`/api/proyectos/${projectId}/personal`, { cache: "no-store" }),
      ]);
      const jE = (await rE.json().catch(() => ({}))) as { success?: boolean; data?: { empleados?: Empleado[] } };
      const jA = (await rA.json().catch(() => ({}))) as { success?: boolean; data?: { asignaciones?: Asignacion[] }; error?: string };
      if (rE.ok && jE.success) setEmpleados(jE.data?.empleados ?? []);
      if (rA.ok && jA.success) {
        setAsignaciones(jA.data?.asignaciones ?? []);
        setErr(null);
      } else {
        setErr(jA.error ?? "No se pudo cargar el personal");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [projectId]);

  // Calcula costo sugerido al cambiar empleado u horas.
  const empleadoSeleccionado = empleados.find((e) => e.id === form.empleado_id);
  const costoSugerido = empleadoSeleccionado && form.horas
    ? Number(empleadoSeleccionado.costo_hora) * Number(form.horas)
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.empleado_id || !form.horas) return;
    setSaving(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/personal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empleado_id: form.empleado_id,
          fecha: form.fecha,
          horas: Number(form.horas),
          costo_total: Number(form.costo_total) || undefined, // server calcula si está vacío
          observacion: form.observacion.trim() || undefined,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (r.ok && j.success) {
        setForm({ empleado_id: "", fecha: new Date().toISOString().slice(0, 10), horas: "", costo_total: "", observacion: "" });
        await load();
      } else {
        setErr(j.error ?? "No se pudo asignar el empleado");
      }
    } finally {
      setSaving(false);
    }
  }

  const totalHoras = asignaciones.reduce((acc, a) => acc + Number(a.horas), 0);
  const totalCosto = asignaciones.reduce((acc, a) => acc + Number(a.costo_total), 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Registra horas trabajadas por empleado en esta obra. El costo se calcula automáticamente
        según el costo por hora del empleado y se suma al costo real de la obra.
      </p>

      {err ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div> : null}

      {/* Formulario de asignación */}
      {empleados.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No hay empleados cargados. Primero cargá empleados en <Link href="/rrhh/empleados" className="font-medium text-[#3F8E91] underline">RRHH → Empleados</Link>.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">Registrar horas de mano de obra</h3>
          <p className="mt-1 text-xs text-slate-500">
            El costo se calcula con el <strong>costo por hora</strong> del empleado y se suma a la rentabilidad de la obra.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className={lblCls}>Empleado</label>
              <select className={inputCls} value={form.empleado_id} required
                onChange={(e) => setForm({ ...form, empleado_id: e.target.value })}>
                <option value="">Seleccionar…</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}{e.cargo ? ` — ${e.cargo}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lblCls}>Fecha</label>
              <input type="date" className={inputCls} value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <label className={lblCls}>Horas</label>
              <input type="number" step="0.5" min="0" className={inputCls} value={form.horas} required
                onChange={(e) => setForm({ ...form, horas: e.target.value })} />
            </div>
            <div>
              <label className={lblCls}>Costo (opcional)</label>
              <input type="number" className={inputCls} value={form.costo_total}
                placeholder={costoSugerido > 0 ? fmtGs(costoSugerido) : "auto"}
                onChange={(e) => setForm({ ...form, costo_total: e.target.value })} />
            </div>
          </div>
          <div className="mt-3">
            <label className={lblCls}>Observación</label>
            <input className={inputCls} value={form.observacion}
              placeholder="Ej. Avance de cubierta, día completo, ½ jornada"
              onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Asignar"}
            </button>
          </div>
        </form>
      )}

      {/* Resumen + tabla */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Asignaciones registradas</h3>
          <div className="flex gap-4 text-xs">
            <span className="text-slate-500">Total horas: <strong className="tabular-nums text-slate-800">{totalHoras.toFixed(1)}</strong></span>
            <span className="text-slate-500">Total costo MO: <strong className="tabular-nums text-slate-800">{fmtGs(totalCosto)}</strong></span>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Empleado</th>
                <th className="py-2 pr-4 font-medium hidden md:table-cell">Cargo</th>
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 pr-4 font-medium text-right">Horas</th>
                <th className="py-2 pr-4 font-medium text-right">Costo</th>
                <th className="py-2 font-medium hidden lg:table-cell">Observación</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Cargando…</td></tr>
              ) : asignaciones.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">
                  Todavía no hay horas registradas. Registrá horas arriba para calcular el costo real de mano de obra.
                </td></tr>
              ) : (
                asignaciones.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{a.empleado_nombre ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-gray-500 hidden md:table-cell">{a.empleado_cargo ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{fmtFecha(a.fecha)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">{Number(a.horas).toFixed(1)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">{fmtGs(Number(a.costo_total))}</td>
                    <td className="py-2.5 text-gray-500 hidden lg:table-cell">{a.observacion ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#4FAEB2]/50 focus:ring-2 focus:ring-[#4FAEB2]/30";
const lblCls = "block text-xs font-medium text-slate-600 mb-1";
