"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const dynamic = "force-dynamic";

type Reporte = {
  mostrar_salarios: boolean;
  empleados: { activos: number; total: number; detalle_activos: Array<{ id: string; nombre: string; cargo: string | null }> };
  por_especialidad: Array<{ especialidad: string; empleados: number }>;
  certificados_vencidos: Array<{ empleado: string; certificado: string; tipo: string; fecha_vencimiento: string | null }>;
  certificados_por_vencer: Array<{ empleado: string; certificado: string; tipo: string; fecha_vencimiento: string | null }>;
  vacaciones_pendientes: Array<{ empleado: string; dias: number; desde: string; hasta: string }>;
  vacaciones_aprobadas_proximas: Array<{ empleado: string; dias: number; desde: string; hasta: string }>;
  coste_laboral_empleado: Array<{ empleado: string; horas: number; coste: number | null }>;
  coste_laboral_obra: Array<{ obra: string; horas: number; coste: number | null }>;
  marcaciones_empleado: Array<{ empleado: string; horas: number }>;
  marcaciones_obra: Array<{ obra: string; horas: number }>;
};

const fmtH = (h: number) => (Number(h) || 0).toFixed(1);
const fmtM = (n: number | null) => n === null ? "—" : `€ ${(Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReportesRRHH() {
  const [data, setData] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession("/api/rrhh/reportes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Reporte; error?: string }) => {
        if (j?.success && j.data) setData(j.data);
        else setErr(j.error ?? "No se pudo cargar");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="NCG · RRHH"
        title="Reportes"
        description="KPIs consolidados: empleados activos, especialidades, certificados, vacaciones, coste laboral y marcaciones."
        backHref="/rrhh"
        backLabel="RRHH"
      />

      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>}
      {loading && <div className="text-sm text-slate-500">Cargando…</div>}
      {!loading && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Empleados activos" value={String(data.empleados.activos)} hint={`de ${data.empleados.total} total`} />
            <Kpi label="Certificados vencidos" value={String(data.certificados_vencidos.length)} tone={data.certificados_vencidos.length > 0 ? "danger" : undefined} />
            <Kpi label="Por vencer (30 d)" value={String(data.certificados_por_vencer.length)} tone={data.certificados_por_vencer.length > 0 ? "warn" : undefined} />
            <Kpi label="Vacaciones pendientes" value={String(data.vacaciones_pendientes.length)} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card title="Empleados por especialidad">
              <MiniTabla rows={data.por_especialidad.map((r) => [r.especialidad, String(r.empleados)])} cols={["Especialidad", "Empleados"]} />
            </Card>

            <Card title="Vacaciones aprobadas próximas">
              <MiniTabla
                rows={data.vacaciones_aprobadas_proximas.map((r) => [r.empleado, `${r.desde} → ${r.hasta}`, `${r.dias} d`])}
                cols={["Empleado", "Rango", "Días"]}
              />
            </Card>

            <Card title="Certificados vencidos" tone={data.certificados_vencidos.length > 0 ? "danger" : undefined}>
              <MiniTabla
                rows={data.certificados_vencidos.map((r) => [r.empleado, r.certificado, r.fecha_vencimiento ?? "—"])}
                cols={["Empleado", "Certificado", "Vencimiento"]}
              />
            </Card>

            <Card title="Certificados por vencer (< 30 días)" tone={data.certificados_por_vencer.length > 0 ? "warn" : undefined}>
              <MiniTabla
                rows={data.certificados_por_vencer.map((r) => [r.empleado, r.certificado, r.fecha_vencimiento ?? "—"])}
                cols={["Empleado", "Certificado", "Vencimiento"]}
              />
            </Card>

            <Card title="Coste laboral por empleado (imputado a obras)">
              {!data.mostrar_salarios && (
                <div className="mb-2 text-xs text-amber-700">Coste oculto (requiere permiso salarios.ver).</div>
              )}
              <MiniTabla
                rows={data.coste_laboral_empleado.slice(0, 20).map((r) => [r.empleado, fmtH(r.horas), fmtM(r.coste)])}
                cols={["Empleado", "Horas", "Coste"]}
                align={["left", "right", "right"]}
              />
            </Card>

            <Card title="Coste laboral por obra">
              {!data.mostrar_salarios && (
                <div className="mb-2 text-xs text-amber-700">Coste oculto (requiere permiso salarios.ver).</div>
              )}
              <MiniTabla
                rows={data.coste_laboral_obra.slice(0, 20).map((r) => [r.obra, fmtH(r.horas), fmtM(r.coste)])}
                cols={["Obra", "Horas", "Coste"]}
                align={["left", "right", "right"]}
              />
            </Card>

            <Card title="Marcaciones por empleado (mes actual)">
              <MiniTabla
                rows={data.marcaciones_empleado.slice(0, 20).map((r) => [r.empleado, fmtH(r.horas)])}
                cols={["Empleado", "Horas"]}
                align={["left", "right"]}
              />
            </Card>

            <Card title="Marcaciones por obra (mes actual, aprox.)">
              <MiniTabla
                rows={data.marcaciones_obra.slice(0, 20).map((r) => [r.obra, fmtH(r.horas)])}
                cols={["Obra", "Horas"]}
                align={["left", "right"]}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "warn" }) {
  const cls =
    tone === "danger" ? "border-rose-200 bg-rose-50" :
    tone === "warn"   ? "border-amber-200 bg-amber-50" :
    "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "danger" | "warn" }) {
  const border = tone === "danger" ? "border-rose-200" : tone === "warn" ? "border-amber-200" : "border-slate-200";
  return (
    <div className={`rounded-xl border ${border} bg-white p-4`}>
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function MiniTabla({ cols, rows, align }: { cols: string[]; rows: string[][]; align?: Array<"left" | "right"> }) {
  if (rows.length === 0) return <div className="text-xs text-slate-400">Sin datos.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-slate-500">
          <tr>
            {cols.map((c, i) => (
              <th key={i} className={`py-1.5 text-xs font-semibold ${align?.[i] === "right" ? "text-right" : "text-left"}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} className={`py-1.5 text-slate-700 ${align?.[ci] === "right" ? "text-right tabular-nums" : ""}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
