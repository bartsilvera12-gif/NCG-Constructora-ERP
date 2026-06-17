"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  calcularEstimado,
  DIAS_TRABAJO_LABEL,
  type DiasTrabajoTipo,
} from "@/lib/proyectos/mano-obra-calculos";

type Empleado = {
  id: string;
  nombre: string;
  cargo: string | null;
  costo_hora: number;
};

type Asignacion = {
  id: string;
  empleado_id: string;
  empleado_nombre: string | null;
  empleado_cargo: string | null;
  fecha: string;
  horas: number | string;
  costo_total: number | string;
  observacion: string | null;
  modo?: string | null;
  fecha_desde?: string | null;
  fecha_hasta_estimada?: string | null;
  fecha_fin_real?: string | null;
  horas_por_dia?: number | string | null;
  dias_trabajo_tipo?: string | null;
  costo_hora_snapshot?: number | string | null;
  dias_estimados?: number | null;
  horas_estimadas?: number | string | null;
  costo_estimado?: number | string | null;
  dias_reales?: number | null;
  horas_reales?: number | string | null;
  costo_real?: number | string | null;
  estado?: string | null;
  motivo_finalizacion?: string | null;
};

const MOTIVOS = [
  { value: "fin_trabajo", label: "Fin de trabajo" },
  { value: "cambio_obra", label: "Cambio a otra obra" },
  { value: "ausencia", label: "Ausencia" },
  { value: "decision_interna", label: "Decisión interna" },
  { value: "otro", label: "Otro" },
];

function fmtEur(n: number | string | null | undefined): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  return `€ ${v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-ES");
  } catch {
    return iso;
  }
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#4FAEB2]/50 focus:ring-2 focus:ring-[#4FAEB2]/30";
const lblCls = "block text-xs font-medium text-slate-600 mb-1";

export default function PersonalObra({ projectId }: { projectId: string }) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    empleado_id: "",
    fecha_desde: new Date().toISOString().slice(0, 10),
    fecha_hasta_estimada: "",
    horas_por_dia: "8",
    dias_trabajo_tipo: "lun_vie" as DiasTrabajoTipo,
    dias_manual: "",
    costo_hora: "",
    observacion: "",
  });

  // Modal finalizar
  const [finalizarTarget, setFinalizarTarget] = useState<Asignacion | null>(null);
  const [finalizarForm, setFinalizarForm] = useState({
    fecha_fin_real: new Date().toISOString().slice(0, 10),
    motivo: "fin_trabajo",
    observacion: "",
  });
  const [finalizando, setFinalizando] = useState(false);
  // Modal cancelar
  const [cancelarTarget, setCancelarTarget] = useState<Asignacion | null>(null);
  const [cancelando, setCancelando] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rE, rA] = await Promise.all([
        fetchWithSupabaseSession("/api/rrhh/empleados", { cache: "no-store" }),
        fetchWithSupabaseSession(`/api/proyectos/${projectId}/personal`, { cache: "no-store" }),
      ]);
      const jE = (await rE.json().catch(() => ({}))) as { success?: boolean; data?: { empleados?: Empleado[] } };
      const jA = (await rA.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { asignaciones?: Asignacion[] };
        error?: string;
      };
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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const empleadoSeleccionado = empleados.find((e) => e.id === form.empleado_id) ?? null;
  const costoHoraEfectivo =
    form.costo_hora.trim() !== ""
      ? Number(form.costo_hora) || 0
      : empleadoSeleccionado
      ? Number(empleadoSeleccionado.costo_hora) || 0
      : 0;

  const calculo = useMemo(() => {
    if (!form.fecha_desde || !form.fecha_hasta_estimada) {
      return { dias: 0, horas: 0, costo: 0 };
    }
    return calcularEstimado({
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.fecha_hasta_estimada,
      horas_por_dia: Number(form.horas_por_dia) || 0,
      costo_hora: costoHoraEfectivo,
      dias_trabajo_tipo: form.dias_trabajo_tipo,
      dias_manual: form.dias_trabajo_tipo === "manual" ? Number(form.dias_manual) || 0 : null,
    });
  }, [
    form.fecha_desde,
    form.fecha_hasta_estimada,
    form.horas_por_dia,
    form.dias_trabajo_tipo,
    form.dias_manual,
    costoHoraEfectivo,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.empleado_id || !form.fecha_desde || !form.fecha_hasta_estimada) return;
    if (form.fecha_hasta_estimada < form.fecha_desde) {
      setErr("La fecha hasta no puede ser anterior a la fecha desde");
      return;
    }
    if (Number(form.horas_por_dia) <= 0) {
      setErr("Horas por día debe ser > 0");
      return;
    }
    if (form.dias_trabajo_tipo === "manual" && (!form.dias_manual || Number(form.dias_manual) <= 0)) {
      setErr("Ingresá la cantidad de días manuales");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/personal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empleado_id: form.empleado_id,
          fecha_desde: form.fecha_desde,
          fecha_hasta_estimada: form.fecha_hasta_estimada,
          horas_por_dia: Number(form.horas_por_dia),
          dias_trabajo_tipo: form.dias_trabajo_tipo,
          dias_manual:
            form.dias_trabajo_tipo === "manual" ? Number(form.dias_manual) || 0 : undefined,
          costo_hora: form.costo_hora.trim() === "" ? undefined : Number(form.costo_hora),
          observacion: form.observacion.trim() || undefined,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (r.ok && j.success) {
        setForm({
          empleado_id: "",
          fecha_desde: new Date().toISOString().slice(0, 10),
          fecha_hasta_estimada: "",
          horas_por_dia: "8",
          dias_trabajo_tipo: "lun_vie",
          dias_manual: "",
          costo_hora: "",
          observacion: "",
        });
        await load();
      } else {
        setErr(j.error ?? "No se pudo asignar el empleado");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizar(e: React.FormEvent) {
    e.preventDefault();
    if (!finalizarTarget) return;
    setFinalizando(true);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/personal/${finalizarTarget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "finalizar",
            fecha_fin_real: finalizarForm.fecha_fin_real,
            motivo_finalizacion: finalizarForm.motivo,
            observacion: finalizarForm.observacion.trim() || undefined,
          }),
        }
      );
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (r.ok && j.success) {
        setFinalizarTarget(null);
        setFinalizarForm({
          fecha_fin_real: new Date().toISOString().slice(0, 10),
          motivo: "fin_trabajo",
          observacion: "",
        });
        await load();
      } else {
        setErr(j.error ?? "No se pudo finalizar la asignación");
      }
    } finally {
      setFinalizando(false);
    }
  }

  async function confirmarCancelar() {
    if (!cancelarTarget) return;
    setCancelando(true);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/personal/${cancelarTarget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "cancelar" }),
        }
      );
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (r.ok && j.success) {
        setCancelarTarget(null);
        await load();
      } else {
        setErr(j.error ?? "No se pudo cancelar la asignación");
      }
    } finally {
      setCancelando(false);
    }
  }

  // Particionar por estado / modo
  const periodos = asignaciones.filter((a) => a.modo === "periodo");
  const activas = periodos.filter((a) => a.estado === "activa");
  const finalizadas = periodos.filter((a) => a.estado === "finalizada");
  const canceladas = periodos.filter((a) => a.estado === "cancelada");

  // Resumen
  const horasEstActivas = activas.reduce((s, a) => s + num(a.horas_estimadas), 0);
  const costoEstActivas = activas.reduce((s, a) => s + num(a.costo_estimado), 0);
  const horasRealesFin = finalizadas.reduce((s, a) => s + num(a.horas_reales), 0);
  const costoRealFin = finalizadas.reduce((s, a) => s + num(a.costo_real), 0);

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        Asigná empleados a esta obra por un período. El sistema calcula automáticamente el costo
        estimado según fechas, horas por día y costo por hora. Al finalizar, recalcula el costo real
        y lo imputa a la rentabilidad.
      </p>

      {err ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {err}
        </div>
      ) : null}

      {/* Formulario de asignación */}
      {empleados.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No hay empleados cargados. Primero cargá empleados en{" "}
          <Link href="/rrhh/empleados" className="font-medium text-[#3F8E91] underline">
            RRHH → Empleados
          </Link>
          .
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">Asignar empleado a obra</h3>
          <p className="mt-1 text-xs text-slate-500">
            El costo por hora se autocompleta con el del empleado, pero podés editarlo. Se guarda
            como snapshot: cambios futuros al empleado no alteran este costo.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-3">
              <label className={lblCls}>Empleado</label>
              <select
                className={inputCls}
                value={form.empleado_id}
                required
                onChange={(e) => setForm({ ...form, empleado_id: e.target.value, costo_hora: "" })}
              >
                <option value="">Seleccionar…</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.cargo ? ` — ${e.cargo}` : ""}
                  </option>
                ))}
              </select>
              {empleadoSeleccionado?.cargo ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Cargo: <strong className="text-slate-700">{empleadoSeleccionado.cargo}</strong>
                </p>
              ) : null}
            </div>

            <div>
              <label className={lblCls}>Fecha desde</label>
              <input
                type="date"
                className={inputCls}
                value={form.fecha_desde}
                required
                onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })}
              />
            </div>

            <div>
              <label className={lblCls}>Fecha hasta estimada</label>
              <input
                type="date"
                className={inputCls}
                value={form.fecha_hasta_estimada}
                required
                onChange={(e) => setForm({ ...form, fecha_hasta_estimada: e.target.value })}
              />
            </div>

            <div>
              <label className={lblCls}>Horas por día</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className={inputCls}
                value={form.horas_por_dia}
                required
                onChange={(e) => setForm({ ...form, horas_por_dia: e.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <label className={lblCls}>Días de trabajo</label>
              <select
                className={inputCls}
                value={form.dias_trabajo_tipo}
                onChange={(e) =>
                  setForm({ ...form, dias_trabajo_tipo: e.target.value as DiasTrabajoTipo })
                }
              >
                <option value="lun_vie">{DIAS_TRABAJO_LABEL.lun_vie}</option>
                <option value="lun_sab">{DIAS_TRABAJO_LABEL.lun_sab}</option>
                <option value="todos">{DIAS_TRABAJO_LABEL.todos}</option>
                <option value="manual">{DIAS_TRABAJO_LABEL.manual}</option>
              </select>
            </div>

            {form.dias_trabajo_tipo === "manual" ? (
              <div>
                <label className={lblCls}>Días (manual)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className={inputCls}
                  value={form.dias_manual}
                  required
                  onChange={(e) => setForm({ ...form, dias_manual: e.target.value })}
                />
              </div>
            ) : null}

            <div>
              <label className={lblCls}>
                Costo por hora{" "}
                <span className="text-[10px] text-slate-400">
                  {empleadoSeleccionado
                    ? `(emp.: € ${Number(empleadoSeleccionado.costo_hora).toLocaleString("es-ES")})`
                    : ""}
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={form.costo_hora}
                placeholder={
                  empleadoSeleccionado
                    ? String(Number(empleadoSeleccionado.costo_hora) || 0)
                    : "0"
                }
                onChange={(e) => setForm({ ...form, costo_hora: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className={lblCls}>Observación</label>
            <input
              className={inputCls}
              value={form.observacion}
              placeholder="Ej. Reemplazo de tejas, primer tramo"
              onChange={(e) => setForm({ ...form, observacion: e.target.value })}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="text-slate-700">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Cálculo estimado
              </div>
              <div className="mt-1">
                <strong className="tabular-nums">{calculo.dias}</strong> días ×{" "}
                <strong className="tabular-nums">{Number(form.horas_por_dia) || 0}</strong> h ={" "}
                <strong className="tabular-nums">{calculo.horas}</strong> h
              </div>
              <div>
                {calculo.horas} h × € {costoHoraEfectivo.toLocaleString("es-ES")} ={" "}
                <strong className="tabular-nums text-slate-900">{fmtEur(calculo.costo)}</strong>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Asignando…" : "Asignar empleado"}
            </button>
          </div>
        </form>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ResumenCard label="Empleados activos" value={String(new Set(activas.map((a) => a.empleado_id)).size)} />
        <ResumenCard label="Horas estimadas" value={horasEstActivas.toFixed(1)} />
        <ResumenCard label="Costo estimado" value={fmtEur(costoEstActivas)} />
        <ResumenCard label="Costo real (finalizadas)" value={fmtEur(costoRealFin)} sub={`${horasRealesFin.toFixed(1)} h reales`} />
      </div>

      {/* Activas */}
      <SectionTabla
        titulo="Asignaciones activas"
        vacio="Todavía no hay empleados asignados a esta obra."
        rows={activas}
        modo="activa"
        loading={loading}
        onFinalizar={(a) => setFinalizarTarget(a)}
        onCancelar={(a) => setCancelarTarget(a)}
      />

      {/* Finalizadas */}
      {finalizadas.length > 0 ? (
        <SectionTabla
          titulo="Historial de asignaciones (finalizadas)"
          rows={finalizadas}
          modo="finalizada"
          loading={false}
          vacio=""
        />
      ) : null}

      {/* Canceladas */}
      {canceladas.length > 0 ? (
        <SectionTabla
          titulo="Canceladas"
          rows={canceladas}
          modo="cancelada"
          loading={false}
          vacio=""
        />
      ) : null}

      {/* Modal cancelar */}
      {cancelarTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800">Cancelar asignación</h3>
            <p className="mt-2 text-sm text-slate-600">
              ¿Querés cancelar la asignación de{" "}
              <strong>{cancelarTarget.empleado_nombre ?? "este empleado"}</strong>? La asignación
              dejará de sumar al costo de la obra.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelarTarget(null)}
                disabled={cancelando}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={confirmarCancelar}
                disabled={cancelando}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-rose-700"
              >
                {cancelando ? "Cancelando…" : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal finalizar */}
      {finalizarTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleFinalizar}
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-800">Finalizar asignación</h3>
            <p className="mt-1 text-xs text-slate-500">
              {finalizarTarget.empleado_nombre} · desde {fmtFecha(finalizarTarget.fecha_desde)}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className={lblCls}>Fecha real de finalización</label>
                <input
                  type="date"
                  className={inputCls}
                  required
                  min={finalizarTarget.fecha_desde ?? undefined}
                  value={finalizarForm.fecha_fin_real}
                  onChange={(e) =>
                    setFinalizarForm({ ...finalizarForm, fecha_fin_real: e.target.value })
                  }
                />
              </div>
              <div>
                <label className={lblCls}>Motivo</label>
                <select
                  className={inputCls}
                  value={finalizarForm.motivo}
                  onChange={(e) => setFinalizarForm({ ...finalizarForm, motivo: e.target.value })}
                >
                  {MOTIVOS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lblCls}>Observación</label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={finalizarForm.observacion}
                  onChange={(e) =>
                    setFinalizarForm({ ...finalizarForm, observacion: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFinalizarTarget(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={finalizando}
                className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {finalizando ? "Finalizando…" : "Finalizar asignación"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ResumenCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums text-slate-800">{value}</div>
      {sub ? <div className="text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

function SectionTabla({
  titulo,
  rows,
  modo,
  loading,
  vacio,
  onFinalizar,
  onCancelar,
}: {
  titulo: string;
  rows: Asignacion[];
  modo: "activa" | "finalizada" | "cancelada";
  loading: boolean;
  vacio: string;
  onFinalizar?: (a: Asignacion) => void;
  onCancelar?: (a: Asignacion) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-4 font-medium">Empleado</th>
              <th className="py-2 pr-4 font-medium hidden md:table-cell">Cargo</th>
              <th className="py-2 pr-4 font-medium">Desde</th>
              <th className="py-2 pr-4 font-medium">
                {modo === "finalizada" ? "Fin real" : "Hasta estim."}
              </th>
              <th className="py-2 pr-4 font-medium text-right">Días</th>
              <th className="py-2 pr-4 font-medium text-right">Horas</th>
              <th className="py-2 pr-4 font-medium text-right">€/h</th>
              <th className="py-2 pr-4 font-medium text-right">Costo</th>
              {modo === "activa" ? <th className="py-2 font-medium text-right">Acción</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-gray-400">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400">
                  {vacio || "Sin registros."}
                </td>
              </tr>
            ) : (
              rows.map((a) => {
                const diasShow =
                  modo === "finalizada" ? a.dias_reales ?? 0 : a.dias_estimados ?? 0;
                const horasShow =
                  modo === "finalizada" ? num(a.horas_reales) : num(a.horas_estimadas);
                const costoShow =
                  modo === "finalizada" ? num(a.costo_real) : num(a.costo_estimado);
                const fechaHastaShow =
                  modo === "finalizada" ? a.fecha_fin_real : a.fecha_hasta_estimada;
                return (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">
                      {a.empleado_nombre ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500 hidden md:table-cell">
                      {a.empleado_cargo ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">{fmtFecha(a.fecha_desde)}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{fmtFecha(fechaHastaShow)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                      {diasShow}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                      {horasShow.toFixed(1)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                      {fmtEur(a.costo_hora_snapshot)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                      {fmtEur(costoShow)}
                    </td>
                    {modo === "activa" ? (
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onFinalizar?.(a)}
                            className="rounded-md border border-[#4FAEB2] px-2 py-1 text-[11px] font-medium text-[#3F8E91] hover:bg-[#E5F4F4]"
                          >
                            Finalizar
                          </button>
                          <button
                            type="button"
                            onClick={() => onCancelar?.(a)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    ) : null}
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
