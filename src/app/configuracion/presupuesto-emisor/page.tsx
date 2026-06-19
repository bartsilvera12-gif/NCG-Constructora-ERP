"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";

type Emisor = {
  nombre: string;
  direccion: string;
  cp_ciudad: string;
  provincia: string;
  nif: string;
  telefono: string;
  email: string;
};

const EMPTY: Emisor = {
  nombre: "", direccion: "", cp_ciudad: "", provincia: "",
  nif: "", telefono: "", email: "",
};

const INPUT = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";
const LABEL = "text-xs font-semibold uppercase tracking-wider text-slate-500";

export default function EmisorPresupuestoPage() {
  const [form, setForm] = useState<Emisor>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchWithSupabaseSession("/api/configuracion/presupuesto-emisor");
        const j = await r.json();
        if (j.success && j.data?.emisor) {
          const e = j.data.emisor;
          setForm({
            nombre: e.nombre ?? "",
            direccion: e.direccion ?? "",
            cp_ciudad: e.cp_ciudad ?? "",
            provincia: e.provincia ?? "",
            nif: e.nif ?? "",
            telefono: e.telefono ?? "",
            email: e.email ?? "",
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setField = (k: keyof Emisor) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetchWithSupabaseSession("/api/configuracion/presupuesto-emisor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (j.success) setMsg("Guardado correctamente.");
      else setMsg(j.error ?? "Error al guardar.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <PageHeader
        eyebrow="NCG · Configuración"
        title="Datos del emisor (presupuesto)"
        description="Aparecen en el encabezado izquierdo del PDF del presupuesto."
      />

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre / razón social" value={form.nombre} onChange={setField("nombre")} />
            <Field label="N.I.F." value={form.nif} onChange={setField("nif")} />
            <Field label="Dirección" value={form.direccion} onChange={setField("direccion")} colSpan={2} />
            <Field label="CP + ciudad" value={form.cp_ciudad} onChange={setField("cp_ciudad")} />
            <Field label="Provincia" value={form.provincia} onChange={setField("provincia")} />
            <Field label="Teléfono" value={form.telefono} onChange={setField("telefono")} />
            <Field label="E-mail" value={form.email} onChange={setField("email")} type="email" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={guardar} disabled={saving} variant="primary">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            {msg && (
              <span className={`text-sm ${msg.startsWith("Guardado") ? "text-emerald-600" : "text-rose-600"}`}>
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, colSpan, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colSpan?: number;
  type?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${colSpan === 2 ? "md:col-span-2" : ""}`}>
      <span className={LABEL}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      />
    </label>
  );
}
