"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const dynamic = "force-dynamic";

type Solicitud = {
  id: string;
  numero: string;
  fecha: string;
  estado: "borrador"|"autorizado"|"comprado"|"facturado"|"cancelado";
  total_estimado: number;
  empleado_nombre_snapshot: string | null;
  proyecto_nombre_snapshot: string | null;
  proveedor_nombre_snapshot: string | null;
  observaciones: string | null;
};

const ESTADO_STYLE: Record<Solicitud["estado"], string> = {
  borrador:    "bg-slate-100 text-slate-700",
  autorizado:  "bg-sky-50 text-sky-700",
  comprado:    "bg-amber-50 text-amber-700",
  facturado:   "bg-emerald-50 text-emerald-700",
  cancelado:   "bg-rose-50 text-rose-700",
};

function fmt(n: number) {
  return `€ ${(Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SolicitudesComprasPage() {
  const router = useRouter();
  const [items, setItems] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Solicitud | null>(null);
  const [deleting, setDeleting] = useState(false);

  const cargar = () => {
    setLoading(true);
    fetchWithSupabaseSession("/api/compras/solicitudes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { solicitudes: Solicitud[] }; error?: string }) => {
        if (j?.success && j.data) { setItems(j.data.solicitudes); setErr(null); }
        else setErr(j.error ?? "No se pudo cargar");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  };
  useEffect(cargar, []);

  const crear = async () => {
    setCreating(true);
    const r = await fetchWithSupabaseSession("/api/compras/solicitudes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), items: [] }),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { solicitud: { id: string } }; error?: string };
    setCreating(false);
    if (r.ok && j.data) router.push(`/compras/solicitudes/${j.data.solicitud.id}`);
    else alert(j.error ?? "Error");
  };

  const confirmarEliminar = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const r = await fetchWithSupabaseSession(`/api/compras/solicitudes/${confirmDelete.id}`, { method: "DELETE" });
    setDeleting(false); setConfirmDelete(null);
    if (r.ok) cargar();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compras"
        title="Hojas de compra"
        description="Solicitudes/hojas imprimibles para que un empleado autorizado compre materiales por cuenta de la empresa."
        backHref="/compras"
        backLabel="Compras"
        actions={
          <button onClick={crear} disabled={creating}
            className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F9EA2] disabled:opacity-50">
            {creating ? "Creando…" : "+ Nueva hoja"}
          </button>
        }
      />

      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Nº</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Obra</th>
              <th className="px-4 py-3 font-semibold">Empleado</th>
              <th className="px-4 py-3 font-semibold">Proveedor</th>
              <th className="px-4 py-3 font-semibold text-right">Total</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">Sin hojas de compra</td></tr>
            ) : items.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-mono text-xs">
                  <Link href={`/compras/solicitudes/${s.id}`} className="hover:underline">{s.numero}</Link>
                </td>
                <td className="px-4 py-2.5">{s.fecha}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.proyecto_nombre_snapshot ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.empleado_nombre_snapshot ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.proveedor_nombre_snapshot ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(s.total_estimado)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_STYLE[s.estado]}`}>{s.estado}</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <a href={`/api/compras/solicitudes/${s.id}/pdf`} target="_blank" rel="noreferrer"
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50">PDF</a>
                  <button onClick={() => setConfirmDelete(s)}
                    className="ml-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Eliminar hoja de compra"
        message={confirmDelete ? `¿Eliminar la hoja ${confirmDelete.numero}? Se borran también sus ítems.` : undefined}
        confirmLabel="Eliminar" tone="danger" loading={deleting}
        onConfirm={confirmarEliminar}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
