"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Cursos y certificados del empleado — Fase D.
 * Se embebe dentro del modal "Editar empleado". Carga el catálogo y los
 * registros del empleado; permite alta con archivo opcional. Estado calculado
 * dinámicamente desde fecha_vencimiento (vigente / por_vencer / vencido).
 */

type Tipo = "curso" | "certificado" | "habilitacion" | "documento_legal";
type Estado = "vigente" | "por_vencer" | "vencido" | "pendiente";

type CursoCatalogoRow = {
  id: string; nombre: string; slug: string; tipo: Tipo;
  entidad_emisora_default: string | null; duracion_dias: number | null; activo: boolean;
};
type EmpleadoCursoRow = {
  id: string; curso_id: string | null; nombre: string; tipo: Tipo;
  entidad_emisora: string | null;
  fecha_emision: string | null; fecha_vencimiento: string | null;
  estado_calc: Estado;
  observaciones: string | null;
  storage_path: string | null; url: string | null;
};

const TIPO_LABEL: Record<Tipo, string> = {
  curso: "Curso", certificado: "Certificado", habilitacion: "Habilitación", documento_legal: "Documento",
};
const ESTADO_STYLE: Record<Estado, string> = {
  vigente: "bg-emerald-50 text-emerald-700 border-emerald-200",
  por_vencer: "bg-amber-50 text-amber-700 border-amber-200",
  vencido: "bg-rose-50 text-rose-700 border-rose-200",
  pendiente: "bg-slate-50 text-slate-500 border-slate-200",
};
const ESTADO_LABEL: Record<Estado, string> = {
  vigente: "Vigente", por_vencer: "Por vencer", vencido: "Vencido", pendiente: "Sin fecha",
};

export default function CursosEmpleado({ empleadoId }: { empleadoId: string }) {
  const [catalogo, setCatalogo] = useState<CursoCatalogoRow[]>([]);
  const [items, setItems] = useState<EmpleadoCursoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EmpleadoCursoRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<{
    curso_id: string; nombre: string; tipo: Tipo;
    entidad_emisora: string; fecha_emision: string; fecha_vencimiento: string; observaciones: string;
    file: File | null;
  }>({
    curso_id: "", nombre: "", tipo: "curso",
    entidad_emisora: "", fecha_emision: "", fecha_vencimiento: "", observaciones: "", file: null,
  });

  const cargar = () => {
    setLoading(true);
    Promise.all([
      fetchWithSupabaseSession("/api/rrhh/cursos-catalogo", { cache: "no-store" }).then((r) => r.json()),
      fetchWithSupabaseSession(`/api/rrhh/empleados/${empleadoId}/cursos`, { cache: "no-store" }).then((r) => r.json()),
    ]).then(([catJ, empJ]: [{ data?: { cursos: CursoCatalogoRow[] } }, { data?: { cursos: EmpleadoCursoRow[] } }]) => {
      setCatalogo((catJ.data?.cursos ?? []).filter((c) => c.activo));
      setItems(empJ.data?.cursos ?? []);
    }).finally(() => setLoading(false));
  };
  useEffect(cargar, [empleadoId]);

  const onSelectCatalogo = (id: string) => {
    const cat = catalogo.find((c) => c.id === id);
    if (!cat) { setForm((s) => ({ ...s, curso_id: "" })); return; }
    setForm((s) => ({
      ...s,
      curso_id: cat.id,
      nombre: cat.nombre,
      tipo: cat.tipo,
      entidad_emisora: cat.entidad_emisora_default ?? s.entidad_emisora,
      fecha_vencimiento: s.fecha_emision && cat.duracion_dias
        ? new Date(new Date(s.fecha_emision).getTime() + cat.duracion_dias * 86400000).toISOString().slice(0, 10)
        : s.fecha_vencimiento,
    }));
  };
  const onFechaEmision = (v: string) => {
    setForm((s) => {
      const cat = catalogo.find((c) => c.id === s.curso_id);
      const nextVenc = cat?.duracion_dias && v
        ? new Date(new Date(v).getTime() + cat.duracion_dias * 86400000).toISOString().slice(0, 10)
        : s.fecha_vencimiento;
      return { ...s, fecha_emision: v, fecha_vencimiento: nextVenc };
    });
  };

  const crear = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true); setMsg(null);
    const fd = new FormData();
    if (form.curso_id) fd.append("curso_id", form.curso_id);
    fd.append("nombre", form.nombre);
    fd.append("tipo", form.tipo);
    if (form.entidad_emisora) fd.append("entidad_emisora", form.entidad_emisora);
    if (form.fecha_emision) fd.append("fecha_emision", form.fecha_emision);
    if (form.fecha_vencimiento) fd.append("fecha_vencimiento", form.fecha_vencimiento);
    if (form.observaciones) fd.append("observaciones", form.observaciones);
    if (form.file) fd.append("file", form.file);
    const r = await fetchWithSupabaseSession(`/api/rrhh/empleados/${empleadoId}/cursos`, {
      method: "POST", body: fd,
    });
    setSaving(false);
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      if (j?.data?.warning) setMsg(j.data.warning);
      setShowForm(false);
      setForm({ curso_id: "", nombre: "", tipo: "curso", entidad_emisora: "", fecha_emision: "", fecha_vencimiento: "", observaciones: "", file: null });
      cargar();
    } else { const j = await r.json().catch(() => ({})); setMsg(j.error ?? "Error"); }
  };

  const confirmarEliminar = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const r = await fetchWithSupabaseSession(`/api/rrhh/empleados/${empleadoId}/cursos/${confirmDelete.id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmDelete(null);
    if (r.ok) cargar();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cursos y certificados</h3>
        <div className="flex items-center gap-2">
          <Link href="/configuracion/rrhh/cursos-catalogo" className="text-xs text-slate-500 hover:underline">Catálogo →</Link>
          <button type="button" onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-[#4FAEB2] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#3F9EA2]">
            {showForm ? "Cerrar" : "+ Añadir"}
          </button>
        </div>
      </div>

      {msg && <div className="mb-2 text-xs text-slate-500">{msg}</div>}

      {showForm && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="text-xs">
              <span className="text-slate-600">Curso del catálogo (opcional)</span>
              <select value={form.curso_id} onChange={(e) => onSelectCatalogo(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm">
                <option value="">— libre —</option>
                {catalogo.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="text-xs md:col-span-2">
              <span className="text-slate-600">Nombre *</span>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">
              <span className="text-slate-600">Tipo</span>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Tipo })}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm">
                {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="text-xs md:col-span-2">
              <span className="text-slate-600">Entidad emisora</span>
              <input value={form.entidad_emisora} onChange={(e) => setForm({ ...form, entidad_emisora: e.target.value })}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">
              <span className="text-slate-600">Fecha emisión</span>
              <input type="date" value={form.fecha_emision} onChange={(e) => onFechaEmision(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">
              <span className="text-slate-600">Fecha vencimiento</span>
              <input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">
              <span className="text-slate-600">Archivo (opcional)</span>
              <input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
                className="mt-1 w-full text-xs" />
            </label>
            <label className="text-xs md:col-span-3">
              <span className="text-slate-600">Observaciones</span>
              <textarea rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
            </label>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs">Cancelar</button>
            <button type="button" onClick={crear} disabled={saving || !form.nombre.trim()}
              className="rounded bg-[#4FAEB2] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="text-xs text-slate-400">Cargando…</div> : items.length === 0 ? (
        <div className="text-xs text-slate-400">Sin cursos ni certificados registrados.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${ESTADO_STYLE[c.estado_calc]}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{c.nombre}</div>
                <div className="text-[11px] text-slate-500">
                  {TIPO_LABEL[c.tipo]}
                  {c.entidad_emisora && ` · ${c.entidad_emisora}`}
                  {c.fecha_vencimiento && ` · vence ${c.fecha_vencimiento}`}
                </div>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ESTADO_STYLE[c.estado_calc]}`}>
                {ESTADO_LABEL[c.estado_calc]}
              </span>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" title="Descargar"
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50">📄</a>
              )}
              <button type="button" onClick={() => setConfirmDelete(c)} title="Eliminar"
                className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">×</button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title="Eliminar registro"
        message={confirmDelete ? `¿Eliminar "${confirmDelete.nombre}"? Se borra también el archivo adjunto si existe.` : undefined}
        confirmLabel="Eliminar"
        tone="danger"
        loading={deleting}
        onConfirm={confirmarEliminar}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  );
}
