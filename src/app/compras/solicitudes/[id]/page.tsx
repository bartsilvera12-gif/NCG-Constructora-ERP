"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const dynamic = "force-dynamic";

type Solicitud = {
  id: string;
  numero: string;
  fecha: string;
  estado: "borrador"|"autorizado"|"comprado"|"facturado"|"cancelado";
  proyecto_id: string | null;
  empleado_id: string | null;
  proveedor_nombre_snapshot: string | null;
  empresa_nombre_snapshot: string | null;
  observaciones: string | null;
  total_estimado: number;
};
type Item = { id?: string; orden: number; descripcion: string; cantidad: number; unidad: string | null; precio_estimado: number | null; observaciones: string | null };
type Empleado = { id: string; nombre: string };
type Proyecto = { id: string; titulo: string };

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numn = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number) => (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SolicitudDetalle() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const [cab, setCab] = useState<Solicitud | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchWithSupabaseSession(`/api/compras/solicitudes/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetchWithSupabaseSession("/api/rrhh/empleados", { cache: "no-store" }).then((r) => r.json()),
      fetchWithSupabaseSession("/api/proyectos", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]).then(([solJ, empJ, projJ]) => {
      setCab(solJ?.data?.solicitud ?? null);
      setItems((solJ?.data?.items ?? []).map((it: Item, i: number) => ({ ...it, orden: it.orden ?? i })));
      setEmpleados(empJ?.data?.empleados ?? []);
      const proj = projJ?.data?.proyectos ?? projJ?.data ?? [];
      setProyectos(Array.isArray(proj) ? proj : []);
    }).finally(() => setLoading(false));
  }, [id]);

  const totalEstimado = useMemo(
    () => items.reduce((a, it) => a + num(it.cantidad) * num(it.precio_estimado), 0),
    [items]
  );

  const setCabField = (k: keyof Solicitud, v: unknown) => cab && setCab({ ...cab, [k]: v as never });

  const addItem = () => setItems((s) => [...s, { orden: s.length, descripcion: "", cantidad: 1, unidad: "", precio_estimado: null, observaciones: null }]);
  const updItem = (i: number, patch: Partial<Item>) => setItems((s) => s.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const rmItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));

  const guardar = async () => {
    if (!id || !cab) return;
    setSaving(true); setMsg(null);
    const body = {
      fecha: cab.fecha,
      proyecto_id: cab.proyecto_id,
      empleado_id: cab.empleado_id,
      proveedor_nombre: cab.proveedor_nombre_snapshot,
      observaciones: cab.observaciones,
      estado: cab.estado,
      items: items.map((it, i) => ({ ...it, orden: i })),
    };
    const r = await fetchWithSupabaseSession(`/api/compras/solicitudes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (r.ok) setMsg("Guardado");
    else { const j = await r.json().catch(() => ({})); setMsg(j.error ?? "Error"); }
    setTimeout(() => setMsg(null), 2500);
  };

  if (loading) return <div className="p-6 text-slate-500">Cargando…</div>;
  if (!cab) return <div className="p-6 text-rose-600">Solicitud no encontrada</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Compras · ${cab.numero}`}
        title="Hoja de compra"
        description={cab.empresa_nombre_snapshot ?? undefined}
        backHref="/compras/solicitudes"
        backLabel="Hojas de compra"
        actions={
          <div className="flex items-center gap-2">
            <a href={`/api/compras/solicitudes/${cab.id}/pdf`} target="_blank" rel="noreferrer"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">📄 PDF</a>
            <button onClick={guardar} disabled={saving}
              className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F9EA2] disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        }
      />
      {msg && <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{msg}</div>}

      {/* Cabecera */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold mb-3">Cabecera</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <F label="Fecha" type="date" value={cab.fecha} onChange={(v) => setCabField("fecha", v)} />
          <div>
            <label className="block text-xs font-medium text-slate-600">Obra / Proyecto</label>
            <select value={cab.proyecto_id ?? ""} onChange={(e) => setCabField("proyecto_id", e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">— sin obra —</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Empleado autorizado</label>
            <select value={cab.empleado_id ?? ""} onChange={(e) => setCabField("empleado_id", e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">— sin asignar —</option>
              {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <F label="Proveedor sugerido" value={cab.proveedor_nombre_snapshot ?? ""} onChange={(v) => setCabField("proveedor_nombre_snapshot", v || null)} />
          <div>
            <label className="block text-xs font-medium text-slate-600">Estado</label>
            <select value={cab.estado} onChange={(e) => setCabField("estado", e.target.value as Solicitud["estado"])}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="borrador">Borrador</option>
              <option value="autorizado">Autorizado</option>
              <option value="comprado">Comprado</option>
              <option value="facturado">Facturado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600">Observaciones</label>
            <textarea rows={2} value={cab.observaciones ?? ""} onChange={(e) => setCabField("observaciones", e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <h3 className="text-sm font-semibold">Ítems</h3>
          <button onClick={addItem} className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs">+ Añadir</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left text-xs">Descripción</th>
                <th className="px-3 py-2 text-right text-xs w-24">Cantidad</th>
                <th className="px-3 py-2 text-left text-xs w-24">Unidad</th>
                <th className="px-3 py-2 text-right text-xs w-32">Precio est. €</th>
                <th className="px-3 py-2 text-right text-xs w-32">Subtotal €</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5">
                    <input value={it.descripcion} onChange={(e) => updItem(i, { descripcion: e.target.value })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm" placeholder="Descripción del material" />
                    <input value={it.observaciones ?? ""} onChange={(e) => updItem(i, { observaciones: e.target.value || null })}
                      className="mt-1 w-full rounded border border-slate-100 px-2 py-1 text-xs text-slate-600" placeholder="Observación (opcional)" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" step="0.01" value={it.cantidad} onChange={(e) => updItem(i, { cantidad: num(e.target.value) })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm text-right" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input value={it.unidad ?? ""} onChange={(e) => updItem(i, { unidad: e.target.value || null })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm" placeholder="kg / m / u" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" step="0.01" value={it.precio_estimado ?? ""} onChange={(e) => updItem(i, { precio_estimado: numn(e.target.value) })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm text-right" />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {fmt(num(it.cantidad) * num(it.precio_estimado))}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => rmItem(i)} className="text-rose-600 text-xs hover:underline">×</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400 text-sm">Sin ítems. Añadí uno para empezar.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold">Total estimado:</td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">€ {fmt(totalEstimado)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function F({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
    </div>
  );
}
