"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const dynamic = "force-dynamic";

type Especialidad = {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  orden: number;
};

export default function EspecialidadesPage() {
  const [items, setItems] = useState<Especialidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Especialidad | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    const r = await fetchWithSupabaseSession("/api/rrhh/especialidades", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { especialidades: Especialidad[] }; error?: string };
    if (r.ok && j.success && j.data) { setItems(j.data.especialidades); setErr(null); }
    else setErr(j.error ?? "No se pudo cargar");
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    const n = nombre.trim();
    if (!n) return;
    setCreating(true);
    const r = await fetchWithSupabaseSession("/api/rrhh/especialidades", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: n, orden: (items[items.length - 1]?.orden ?? 0) + 10 }),
    });
    setCreating(false);
    if (r.ok) { setNombre(""); cargar(); }
    else { const j = await r.json().catch(() => ({})); alert(j.error ?? "Error"); }
  };

  const toggleActivo = async (it: Especialidad) => {
    const r = await fetchWithSupabaseSession(`/api/rrhh/especialidades/${it.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !it.activo }),
    });
    if (r.ok) cargar();
  };

  const confirmarEliminar = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const r = await fetchWithSupabaseSession(`/api/rrhh/especialidades/${confirmDelete.id}`, { method: "DELETE" });
    setDeleting(false);
    if (r.ok) { setConfirmDelete(null); setErrorMsg(null); cargar(); }
    else {
      const j = await r.json().catch(() => ({}));
      setErrorMsg(j.error ?? "No se pudo eliminar (¿tiene empleados asignados?)");
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuración · RRHH"
        title="Especialidades"
        description="Catálogo de puestos/especialidades usado en las fichas de empleado."
        backHref="/rrhh"
        backLabel="RRHH"
      />

      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>}
      {errorMsg && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 flex items-center justify-between gap-3">
        <span>{errorMsg}</span>
        <button onClick={() => setErrorMsg(null)} className="text-rose-700 hover:text-rose-900 text-xs">×</button>
      </div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">Añadir especialidad</h3>
        <div className="mt-2 flex items-center gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Instalador de aislamiento"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button onClick={crear} disabled={creating || !nombre.trim()}
            className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {creating ? "Creando…" : "Crear"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold w-16">#</th>
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold text-slate-500">Slug</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-gray-400">Sin especialidades</td></tr>
            ) : items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2.5 text-slate-500">{it.orden}</td>
                <td className="px-4 py-2.5 font-medium">{it.nombre}</td>
                <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{it.slug}</td>
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
        title="Eliminar especialidad"
        message={confirmDelete ? `¿Eliminar la especialidad "${confirmDelete.nombre}"? Sólo funciona si no hay empleados con esta especialidad asignada.` : undefined}
        confirmLabel="Eliminar"
        tone="danger"
        loading={deleting}
        onConfirm={confirmarEliminar}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
