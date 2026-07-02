"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Panel España de una factura (Fase J).
 * Carga los campos ES (base, IVA, retención, CIF, obra, estado_fiscal),
 * permite editarlos y subir/quitar el archivo (PDF/imagen). Opt-in por
 * factura: si nunca se completa nada, no se muestra en informes España.
 */

type Proyecto = { id: string; titulo: string };

type EspanaFields = {
  cif_nif_receptor: string | null;
  nombre_receptor: string | null;
  base_imponible: number | null;
  iva_pct: number | null;
  iva_importe: number | null;
  retencion_pct: number | null;
  retencion_importe: number | null;
  total_espana: number | null;
  proyecto_id_ncg: string | null;
  tipo_operacion: "nacional" | "intracomunitaria" | "exportacion" | null;
  estado_fiscal: "pendiente" | "informada" | "validada" | "rechazada" | null;
  archivo_storage_path: string | null;
};

const ESTADO_STYLE: Record<NonNullable<EspanaFields["estado_fiscal"]>, string> = {
  pendiente:  "bg-slate-100 text-slate-700",
  informada:  "bg-sky-50 text-sky-700",
  validada:   "bg-emerald-50 text-emerald-700",
  rechazada:  "bg-rose-50 text-rose-700",
};

const numn = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number | null): string =>
  n === null ? "—" : (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FacturaEspanaPanel({ facturaId }: { facturaId: string }) {
  const [f, setF] = useState<EspanaFields | null>(null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const inputFile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchWithSupabaseSession(`/api/facturas/${facturaId}`, { cache: "no-store" }).then((r) => r.json()),
      fetchWithSupabaseSession("/api/proyectos", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetchWithSupabaseSession(`/api/facturas/${facturaId}/espana/archivo`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]).then(([facJ, projJ, archJ]) => {
      const d = facJ?.data as Record<string, unknown> | null;
      if (d) {
        setF({
          cif_nif_receptor: (d.cif_nif_receptor as string | null) ?? null,
          nombre_receptor: (d.nombre_receptor as string | null) ?? null,
          base_imponible: numn(d.base_imponible),
          iva_pct: numn(d.iva_pct),
          iva_importe: numn(d.iva_importe),
          retencion_pct: numn(d.retencion_pct),
          retencion_importe: numn(d.retencion_importe),
          total_espana: numn(d.total_espana),
          proyecto_id_ncg: (d.proyecto_id_ncg as string | null) ?? null,
          tipo_operacion: (d.tipo_operacion as EspanaFields["tipo_operacion"]) ?? null,
          estado_fiscal: (d.estado_fiscal as EspanaFields["estado_fiscal"]) ?? null,
          archivo_storage_path: (d.archivo_storage_path as string | null) ?? null,
        });
      }
      const list = projJ?.data?.proyectos ?? projJ?.data ?? [];
      setProyectos(Array.isArray(list) ? list : []);
      setArchivoUrl((archJ?.data?.url as string | null) ?? null);
    }).finally(() => setLoading(false));
  }, [facturaId]);

  const totalCalc = useMemo(() => {
    if (!f) return 0;
    const base = Number(f.base_imponible) || 0;
    const iva = Number(f.iva_importe) || 0;
    const ret = Number(f.retencion_importe) || 0;
    return base + iva - ret;
  }, [f]);

  const setField = <K extends keyof EspanaFields>(k: K, v: EspanaFields[K]) => {
    if (!f) return;
    setF({ ...f, [k]: v });
  };

  // Auto-cálculo suave: si cambia base o iva_pct, recalcular iva_importe.
  const onBaseChange = (base: number | null) => {
    if (!f) return;
    const iva = base !== null && f.iva_pct !== null ? Number((base * f.iva_pct / 100).toFixed(2)) : f.iva_importe;
    setF({ ...f, base_imponible: base, iva_importe: iva });
  };
  const onIvaPctChange = (pct: number | null) => {
    if (!f) return;
    const iva = pct !== null && f.base_imponible !== null ? Number((f.base_imponible * pct / 100).toFixed(2)) : f.iva_importe;
    setF({ ...f, iva_pct: pct, iva_importe: iva });
  };
  const onRetPctChange = (pct: number | null) => {
    if (!f) return;
    const ret = pct !== null && f.base_imponible !== null ? Number((f.base_imponible * pct / 100).toFixed(2)) : f.retencion_importe;
    setF({ ...f, retencion_pct: pct, retencion_importe: ret });
  };

  const guardar = async () => {
    if (!f) return;
    setSaving(true); setMsg(null);
    const body = {
      cif_nif_receptor: f.cif_nif_receptor,
      nombre_receptor: f.nombre_receptor,
      base_imponible: f.base_imponible,
      iva_pct: f.iva_pct,
      iva_importe: f.iva_importe,
      retencion_pct: f.retencion_pct,
      retencion_importe: f.retencion_importe,
      total_espana: f.total_espana ?? totalCalc,
      proyecto_id_ncg: f.proyecto_id_ncg,
      tipo_operacion: f.tipo_operacion,
      estado_fiscal: f.estado_fiscal,
    };
    const r = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/espana`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (r.ok) { setMsg("Guardado"); setTimeout(() => setMsg(null), 2500); }
    else { const j = await r.json().catch(() => ({})); setMsg(j.error ?? "Error"); }
  };

  const subir = async (file: File) => {
    setSubiendo(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const r = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/espana/archivo`, {
      method: "POST", body: fd,
    });
    setSubiendo(false);
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      setArchivoUrl(j?.data?.url ?? null);
      if (f) setF({ ...f, archivo_storage_path: j?.data?.path ?? f.archivo_storage_path });
    } else { const j = await r.json().catch(() => ({})); setMsg(j.error ?? "Error subiendo archivo"); }
    if (inputFile.current) inputFile.current.value = "";
  };

  const quitarArchivo = async () => {
    const r = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/espana/archivo`, { method: "DELETE" });
    if (r.ok) { setArchivoUrl(null); if (f) setF({ ...f, archivo_storage_path: null }); }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Cargando panel España…</div>;
  if (!f) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Facturación España</h3>
          <p className="text-xs text-slate-500">Datos fiscales para Hacienda (base, IVA, retención, estado). El envío a AEAT no está activo todavía.</p>
        </div>
        <div className="flex items-center gap-2">
          {f.estado_fiscal && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_STYLE[f.estado_fiscal]}`}>{f.estado_fiscal}</span>
          )}
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
          <button onClick={guardar} disabled={saving}
            className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F9EA2] disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
        {/* Receptor */}
        <div className="md:col-span-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <F label="CIF / NIF receptor" value={f.cif_nif_receptor ?? ""} onChange={(v) => setField("cif_nif_receptor", v || null)} placeholder="B12345678" />
          <F label="Nombre / razón social" value={f.nombre_receptor ?? ""} onChange={(v) => setField("nombre_receptor", v || null)} span={2} />
        </div>

        {/* Bases e IVA */}
        <div className="md:col-span-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Desglose fiscal</h4>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-6">
            <F label="Base imponible €" type="number" value={f.base_imponible?.toString() ?? ""} onChange={(v) => onBaseChange(numn(v))} />
            <F label="IVA %" type="number" value={f.iva_pct?.toString() ?? ""} onChange={(v) => onIvaPctChange(numn(v))} />
            <F label="IVA importe €" type="number" value={f.iva_importe?.toString() ?? ""} onChange={(v) => setField("iva_importe", numn(v))} />
            <F label="Retención %" type="number" value={f.retencion_pct?.toString() ?? ""} onChange={(v) => onRetPctChange(numn(v))} />
            <F label="Retención €" type="number" value={f.retencion_importe?.toString() ?? ""} onChange={(v) => setField("retencion_importe", numn(v))} />
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Total España €</label>
              <input type="number" value={f.total_espana?.toString() ?? ""} onChange={(e) => setField("total_espana", numn(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" placeholder={fmt(totalCalc)} />
              <p className="mt-0.5 text-[10px] text-slate-500">Vacío = calculado ({fmt(totalCalc)})</p>
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="md:col-span-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Tipo de operación</label>
            <select value={f.tipo_operacion ?? ""} onChange={(e) => setField("tipo_operacion", (e.target.value || null) as EspanaFields["tipo_operacion"])}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">—</option>
              <option value="nacional">Nacional</option>
              <option value="intracomunitaria">Intracomunitaria</option>
              <option value="exportacion">Exportación</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Estado fiscal</label>
            <select value={f.estado_fiscal ?? ""} onChange={(e) => setField("estado_fiscal", (e.target.value || null) as EspanaFields["estado_fiscal"])}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">—</option>
              <option value="pendiente">Pendiente</option>
              <option value="informada">Informada</option>
              <option value="validada">Validada</option>
              <option value="rechazada">Rechazada</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Obra asociada</label>
            <select value={f.proyecto_id_ncg ?? ""} onChange={(e) => setField("proyecto_id_ncg", e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">—</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
            </select>
          </div>
        </div>

        {/* Archivo */}
        <div className="md:col-span-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Archivo de factura</h4>
          <div className="mt-2 flex items-center gap-3">
            <input ref={inputFile} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
            {archivoUrl ? (
              <>
                <a href={archivoUrl} target="_blank" rel="noreferrer"
                   className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">📄 Abrir archivo</a>
                <button onClick={() => inputFile.current?.click()} disabled={subiendo}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
                  {subiendo ? "Subiendo…" : "Reemplazar"}
                </button>
                <button onClick={quitarArchivo}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100">
                  Quitar
                </button>
              </>
            ) : (
              <button onClick={() => inputFile.current?.click()} disabled={subiendo}
                className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3F9EA2] disabled:opacity-50">
                {subiendo ? "Subiendo…" : "+ Subir PDF/imagen"}
              </button>
            )}
            <span className="text-xs text-slate-500">Máx. 25 MB. PDF/JPG/PNG/WebP.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function F({ label, value, onChange, type = "text", placeholder, span = 1 }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; span?: number;
}) {
  return (
    <div className={span === 2 ? "md:col-span-2" : span === 3 ? "md:col-span-3" : ""}>
      <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
    </div>
  );
}
