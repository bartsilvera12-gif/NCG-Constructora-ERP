"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const dynamic = "force-dynamic";

type Curso = {
  id: string;
  nombre: string;
  slug: string;
  tipo: "curso" | "certificado" | "habilitacion" | "documento_legal";
  entidad_emisora_default: string | null;
  duracion_dias: number | null;
  activo: boolean;
  orden: number;
};

const TIPO_LABEL: Record<Curso["tipo"], string> = {
  curso: "Curso",
  certificado: "Certificado",
  habilitacion: "Habilitación",
  documento_legal: "Documento legal",
};

export default function CursosCatalogoPage() {
  const [items, setItems] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Curso | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<{ nombre: string; tipo: Curso["tipo"]; duracion_dias: string; entidad_emisora_default: string }>({
    nombre: "", tipo: "curso", duracion_dias: "", entidad_emisora_default: "",
  });
  const [creating, setCreating] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const r = await fetchWithSupabaseSession("/api/rrhh/cursos-catalogo", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { cursos: Curso[] }; error?: string };
    if (r.ok && j.success && j.data) { setItems(j.data.cursos); setErr(null); }
    else setErr(j.error ?? "No se pudo cargar");
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    if (!form.nombre.trim()) return;
    setCreating(true);
    const r = await fetchWithSupabaseSession("/api/rrhh/cursos-catalogo", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        duracion_dias: form.duracion_dias ? Number(form.duracion_dias) : null,
        entidad_emisora_default: form.entidad_emisora_default.trim() || null,
        orden: (items[items.length - 1]?.orden ?? 0) + 10,
      }),
    });
    setCreating(false);
    if (r.ok) {
      setForm({ nombre: "", tipo: "curso", duracion_dias: "", entidad_emisora_default: "" });
      cargar();
    } else { const j = await r.json().catch(() => ({})); alert(j.error ?? "Error"); }
  };

  const toggleActivo = async (it: Curso) => {
    await fetchWithSupabaseSession(`/api/rrhh/cursos-catalogo/${it.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !it.activo }),
    });
    cargar();
  };

  const confirmarEliminar = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const r = await fetchWithSupabaseSession(`/api/rrhh/cursos-catalogo/${confirmDelete.id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmDelete(null);
    if (r.ok) cargar();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuración · RRHH"
        title="Cursos y certificados (catálogo)"
        description="Nombres estándar reutilizables al cargar la formación de un empleado."
        backHref="/rrhh"
        backLabel="RRHH"
      />

      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">Añadir curso / certificado</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600">Nombre</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej. Trabajo en altura"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Curso["tipo"] })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              {(Object.keys(TIPO_LABEL) as Curso["tipo"][]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Duración (días)</label>
            <input type="number" value={form.duracion_dias} onChange={(e) => setForm({ ...form, duracion_dias: e.target.value })}
              placeholder="365"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600">Entidad emisora por defecto (opcional)</label>
            <input value={form.entidad_emisora_default} onChange={(e) => setForm({ ...form, entidad_emisora_default: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-1 flex items-end">
            <button onClick={crear} disabled={creating || !form.nombre.trim()}
              className="w-full rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {creating ? "Creando…" : "Crear"}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold w-16">#</th>
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Duración</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400">Sin entradas</td></tr>
            ) : items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2.5 text-slate-500">{it.orden}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{it.nombre}</div>
                  {it.entidad_emisora_default && <div className="text-xs text-slate-500">{it.entidad_emisora_default}</div>}
                </td>
                <td className="px-4 py-2.5">{TIPO_LABEL[it.tipo]}</td>
                <td className="px-4 py-2.5 text-slate-600">{it.duracion_dias ? `${it.duracion_dias} d` : "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${it.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {it.activo ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => toggleActivo(it)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                    {it.activo ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => setConfirmDelete(it)}
                    className="ml-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Eliminar del catálogo"
        message={confirmDelete ? `¿Eliminar "${confirmDelete.nombre}" del catálogo? Los registros ya creados en fichas de empleado no se ven afectados (guardan snapshot del nombre).` : undefined}
        confirmLabel="Eliminar"
        tone="danger"
        loading={deleting}
        onConfirm={confirmarEliminar}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
