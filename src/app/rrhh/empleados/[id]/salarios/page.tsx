"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const dynamic = "force-dynamic";

type Salario = {
  id: string;
  fecha_vigencia_desde: string;
  fecha_vigencia_hasta: string | null;
  salario_bruto: number;
  salario_neto: number | null;
  plus_peligrosidad: number;
  plus_prl: number;
  otros_pluses: Record<string, number>;
  deducciones: Record<string, number>;
  coste_empresa: number | null;
  moneda: string;
  observaciones: string | null;
  created_at: string;
};

type Permisos = { permisos?: Record<string, boolean> };

const fmt = (n: number | null | undefined, moneda = "EUR"): string => {
  if (n === null || n === undefined) return "—";
  const sym = moneda === "EUR" ? "€" : moneda;
  return `${sym} ${(Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function SalariosEmpleadoPage() {
  const params = useParams();
  const empleadoId = params?.id as string | undefined;
  const [empleadoNombre, setEmpleadoNombre] = useState<string>("");
  const [items, setItems] = useState<Salario[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [permitidoVer, setPermitidoVer] = useState(false);
  const [permitidoEditar, setPermitidoEditar] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fecha_vigencia_desde: new Date().toISOString().slice(0, 10),
    fecha_vigencia_hasta: "",
    salario_bruto: "",
    salario_neto: "",
    plus_peligrosidad: "",
    plus_prl: "",
    coste_empresa: "",
    otros_pluses_txt: "",  // "clave: valor" por línea
    deducciones_txt: "",
    moneda: "EUR",
    observaciones: "",
  });

  useEffect(() => {
    fetchWithSupabaseSession("/api/rrhh/me/permisos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: Permisos & { rol?: string; rol_rrhh?: string } }) => {
        setPermitidoVer(Boolean(j.data?.permisos?.["salarios.ver"]));
        setPermitidoEditar(Boolean(j.data?.permisos?.["salarios.editar"]));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!empleadoId || !permitidoVer) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetchWithSupabaseSession(`/api/rrhh/empleados/${empleadoId}`, { cache: "no-store" }).then((r) => r.json()),
      fetchWithSupabaseSession(`/api/rrhh/empleados/${empleadoId}/salarios`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([empJ, salJ]) => {
        setEmpleadoNombre(empJ?.data?.empleado?.nombre ?? "");
        setItems(salJ?.data?.salarios ?? []);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [empleadoId, permitidoVer]);

  const parseKv = (txt: string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([^:]+):\s*(-?\d+(?:[.,]\d+)?)\s*$/);
      if (m) out[m[1].trim()] = Number(m[2].replace(",", "."));
    }
    return out;
  };

  const crear = async () => {
    if (!empleadoId || !form.fecha_vigencia_desde || !form.salario_bruto) return;
    setSaving(true);
    const body = {
      fecha_vigencia_desde: form.fecha_vigencia_desde,
      fecha_vigencia_hasta: form.fecha_vigencia_hasta || null,
      salario_bruto: Number(form.salario_bruto) || 0,
      salario_neto: form.salario_neto ? Number(form.salario_neto) : null,
      plus_peligrosidad: Number(form.plus_peligrosidad) || 0,
      plus_prl: Number(form.plus_prl) || 0,
      coste_empresa: form.coste_empresa ? Number(form.coste_empresa) : null,
      otros_pluses: parseKv(form.otros_pluses_txt),
      deducciones: parseKv(form.deducciones_txt),
      moneda: form.moneda || "EUR",
      observaciones: form.observaciones || null,
    };
    const r = await fetchWithSupabaseSession(`/api/rrhh/empleados/${empleadoId}/salarios`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? "Error"); return; }
    setShowForm(false);
    const salJ = await fetchWithSupabaseSession(`/api/rrhh/empleados/${empleadoId}/salarios`, { cache: "no-store" }).then((x) => x.json());
    setItems(salJ?.data?.salarios ?? []);
    setForm({ ...form, salario_bruto: "", salario_neto: "", plus_peligrosidad: "", plus_prl: "", coste_empresa: "", otros_pluses_txt: "", deducciones_txt: "", observaciones: "" });
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar este tramo salarial?")) return;
    const r = await fetchWithSupabaseSession(`/api/rrhh/empleados/${empleadoId}/salarios/${id}`, { method: "DELETE" });
    if (r.ok) setItems((s) => s.filter((x) => x.id !== id));
  };

  const vigente = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return items.find((s) => s.fecha_vigencia_desde <= hoy && (!s.fecha_vigencia_hasta || s.fecha_vigencia_hasta >= hoy));
  }, [items]);

  if (!permitidoVer) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="RRHH" title="Salarios"
          description="No tenés permiso para ver los salarios de este empleado."
          backHref="/rrhh/empleados" backLabel="Empleados" />
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Contactá al administrador para solicitar acceso al rol de gestor o admin.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`RRHH · ${empleadoNombre || "Empleado"}`}
        title="Historial salarial"
        description="Tramos de vigencia con bruto, neto, pluses y deducciones."
        backHref="/rrhh/empleados"
        backLabel="Empleados"
        actions={
          permitidoEditar ? (
            <button onClick={() => setShowForm((s) => !s)}
              className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F9EA2]">
              {showForm ? "Cerrar" : "+ Nuevo tramo"}
            </button>
          ) : null
        }
      />

      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>}

      {vigente && (
        <div className="rounded-xl border border-[#4FAEB2]/40 bg-[#E5F4F4] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#3F8E91]">Salario vigente</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{fmt(vigente.salario_bruto, vigente.moneda)}</div>
          <div className="text-xs text-slate-500">
            desde {vigente.fecha_vigencia_desde} {vigente.fecha_vigencia_hasta ? `hasta ${vigente.fecha_vigencia_hasta}` : "· indefinido"}
          </div>
        </div>
      )}

      {showForm && permitidoEditar && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Nuevo tramo salarial</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <F label="Vigente desde *" type="date" value={form.fecha_vigencia_desde} onChange={(v) => setForm({ ...form, fecha_vigencia_desde: v })} />
            <F label="Vigente hasta (opcional)" type="date" value={form.fecha_vigencia_hasta} onChange={(v) => setForm({ ...form, fecha_vigencia_hasta: v })} />
            <F label="Moneda" value={form.moneda} onChange={(v) => setForm({ ...form, moneda: v })} />
            <F label="Salario bruto *" type="number" value={form.salario_bruto} onChange={(v) => setForm({ ...form, salario_bruto: v })} />
            <F label="Salario neto" type="number" value={form.salario_neto} onChange={(v) => setForm({ ...form, salario_neto: v })} />
            <F label="Coste empresa" type="number" value={form.coste_empresa} onChange={(v) => setForm({ ...form, coste_empresa: v })} />
            <F label="Plus peligrosidad" type="number" value={form.plus_peligrosidad} onChange={(v) => setForm({ ...form, plus_peligrosidad: v })} />
            <F label="Plus PRL" type="number" value={form.plus_prl} onChange={(v) => setForm({ ...form, plus_prl: v })} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">Otros pluses (uno por línea: "clave: valor")</label>
              <textarea rows={3} value={form.otros_pluses_txt} onChange={(e) => setForm({ ...form, otros_pluses_txt: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                placeholder="antiguedad: 30&#10;nocturno: 45" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Deducciones (uno por línea: "clave: valor")</label>
              <textarea rows={3} value={form.deducciones_txt} onChange={(e) => setForm({ ...form, deducciones_txt: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                placeholder="irpf_pct: 9.76&#10;ss_pct: 4.7" />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600">Observaciones del gestor</label>
            <textarea rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">Cancelar</button>
            <button onClick={crear} disabled={saving || !form.fecha_vigencia_desde || !form.salario_bruto}
              className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar tramo"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Vigencia</th>
              <th className="px-4 py-3 font-semibold text-right">Bruto</th>
              <th className="px-4 py-3 font-semibold text-right">Neto</th>
              <th className="px-4 py-3 font-semibold text-right">Pluses</th>
              <th className="px-4 py-3 font-semibold text-right">Coste empresa</th>
              <th className="px-4 py-3 font-semibold">Observaciones</th>
              {permitidoEditar && <th className="px-4 py-3 font-semibold text-right"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={permitidoEditar ? 7 : 6} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={permitidoEditar ? 7 : 6} className="py-10 text-center text-gray-400">Sin salarios registrados</td></tr>
            ) : items.map((s) => {
              const totalPluses = s.plus_peligrosidad + s.plus_prl + Object.values(s.otros_pluses ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
              return (
                <tr key={s.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{s.fecha_vigencia_desde}</div>
                    <div className="text-xs text-slate-500">{s.fecha_vigencia_hasta ?? "indefinido"}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold">{fmt(s.salario_bruto, s.moneda)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(s.salario_neto, s.moneda)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(totalPluses, s.moneda)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(s.coste_empresa, s.moneda)}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[220px] truncate">{s.observaciones ?? ""}</td>
                  {permitidoEditar && (
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => eliminar(s.id)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100">Eliminar</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
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
