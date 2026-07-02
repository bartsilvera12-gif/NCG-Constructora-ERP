"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  DocumentacionEmpleado,
  ResumenVacacionesEmpleado,
  EspecialidadesEmpleado,
} from "@/app/rrhh/empleados/page";
import CursosEmpleado from "@/app/rrhh/empleados/CursosEmpleado";

export const dynamic = "force-dynamic";

type Empleado = {
  id: string;
  nombre: string;
  tipo_documento: string | null;
  documento: string | null;
  fecha_nacimiento: string | null;
  lugar_nacimiento: string | null;
  nacionalidad: string | null;
  estado_civil: string | null;
  grupo_sanguineo: string | null;
  direccion: string | null;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  fecha_ingreso: string | null;
  fecha_baja: string | null;
  tipo_empleado: string | null;
  tipo_periodo: string | null;
  tipo_contrato: string | null;
  jornada_laboral: string | null;
  estado: string | null;
  sucursal: string | null;
  departamento: string | null;
  seccion: string | null;
  supervisor: string | null;
  afiliacion_ss: string | null;
  grupo_cotizacion: string | null;
  categoria_nivel: string | null;
  salario_base: number;
  salario_complementario: number;
  costo_hora: number;
  banco: string | null;
  numero_cuenta: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  contacto_emergencia_parentesco: string | null;
  observaciones: string | null;
  activo: boolean;
};

type Fichaje = { fecha: string; hora_entrada: string | null; hora_salida: string | null; horas: number | null; observacion: string | null };
type Permisos = { permisos?: Record<string, boolean> };

type Tab = "general" | "laboral" | "salario" | "documentos" | "cursos" | "vacaciones" | "marcaciones";

const TABS: Array<{ key: Tab; label: string; permiso?: string }> = [
  { key: "general",     label: "General" },
  { key: "laboral",     label: "Laboral" },
  { key: "salario",     label: "Salario",     permiso: "salarios.ver" },
  { key: "documentos",  label: "Documentos" },
  { key: "cursos",      label: "Cursos" },
  { key: "vacaciones",  label: "Vacaciones" },
  { key: "marcaciones", label: "Marcaciones" },
];

const ESTADO_STYLE: Record<string, string> = {
  activo:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  pendiente:  "bg-amber-50  text-amber-700  border-amber-200",
  suspendido: "bg-slate-100 text-slate-700  border-slate-200",
  baja:       "bg-rose-50   text-rose-700   border-rose-200",
};

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `€ ${(Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtHora(h: string | null): string { return h ? h.slice(0, 5) : "—"; }
function v(s: string | null | undefined): string {
  if (s === null || s === undefined) return "—";
  const t = String(s).trim();
  return t.length === 0 ? "—" : t;
}

export default function EmpleadoDetalle() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const [emp, setEmp] = useState<Empleado | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);

  useEffect(() => {
    fetchWithSupabaseSession("/api/rrhh/me/permisos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: Permisos }) => setPermisos(j.data?.permisos ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchWithSupabaseSession(`/api/rrhh/empleados/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { empleado: Empleado }; error?: string }) => {
        if (j?.success && j.data) { setEmp(j.data.empleado); setErr(null); }
        else setErr(j.error ?? "Empleado no encontrado");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || tab !== "marcaciones") return;
    const hoy = new Date();
    const desde = new Date(hoy); desde.setDate(hoy.getDate() - 30);
    const desdeIso = desde.toISOString().slice(0, 10);
    const hastaIso = hoy.toISOString().slice(0, 10);
    fetchWithSupabaseSession(`/api/rrhh/fichajes?desde=${desdeIso}&hasta=${hastaIso}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: { fichajes: Array<Fichaje & { empleado_id: string }> } }) => {
        const soloEmp = (j.data?.fichajes ?? []).filter((f) => (f as unknown as { empleado_id: string }).empleado_id === id);
        setFichajes(soloEmp);
      })
      .catch(() => setFichajes([]));
  }, [id, tab]);

  const totalHorasMes = useMemo(
    () => fichajes.reduce((a, f) => a + (Number(f.horas) || 0), 0),
    [fichajes]
  );

  const tabsVisibles = TABS.filter((t) => !t.permiso || permisos[t.permiso]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Cargando…</div>;
  if (err || !emp) return <div className="p-6 text-sm text-rose-600">{err ?? "No encontrado"}</div>;

  const estadoLabel = emp.estado ?? (emp.activo ? "activo" : "baja");
  const estadoStyle = ESTADO_STYLE[estadoLabel] ?? ESTADO_STYLE.activo;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="NCG · RRHH"
        title={emp.nombre}
        description={emp.cargo ? `${emp.cargo}${emp.documento ? ` · ${emp.documento}` : ""}` : (emp.documento ?? undefined)}
        backHref="/rrhh/empleados"
        backLabel="Empleados"
        actions={
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${estadoStyle}`}>{estadoLabel}</span>
            <a href={`/api/rrhh/empleados/${emp.id}/ficha-pdf`} target="_blank" rel="noreferrer"
               className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">📄 Ficha PDF</a>
          </div>
        }
      />

      {/* Tabs */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 p-1.5">
          {tabsVisibles.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.key
                  ? "bg-[#4FAEB2] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "general" && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
              <Bloque titulo="Identificación">
                <Kv k="Nombre completo" v={v(emp.nombre)} />
                <Kv k="Tipo documento" v={v(emp.tipo_documento)} />
                <Kv k="Nº documento" v={v(emp.documento)} />
                <Kv k="Nacionalidad" v={v(emp.nacionalidad)} />
              </Bloque>
              <Bloque titulo="Datos personales">
                <Kv k="Fecha nacimiento" v={fmtFecha(emp.fecha_nacimiento)} />
                <Kv k="Lugar de nacimiento" v={v(emp.lugar_nacimiento)} />
                <Kv k="Estado civil" v={v(emp.estado_civil)} />
                <Kv k="Grupo sanguíneo" v={v(emp.grupo_sanguineo)} />
              </Bloque>
              <Bloque titulo="Contacto">
                <Kv k="Teléfono" v={v(emp.telefono)} />
                <Kv k="Email" v={v(emp.email)} />
                <Kv k="Dirección" v={v(emp.direccion)} />
              </Bloque>
              <Bloque titulo="Contacto de emergencia">
                <Kv k="Nombre" v={v(emp.contacto_emergencia_nombre)} />
                <Kv k="Teléfono" v={v(emp.contacto_emergencia_telefono)} />
                <Kv k="Parentesco" v={v(emp.contacto_emergencia_parentesco)} />
              </Bloque>
              {emp.observaciones && (
                <Bloque titulo="Observaciones internas" span={2}>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{emp.observaciones}</p>
                </Bloque>
              )}
            </div>
          )}

          {tab === "laboral" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
                <Bloque titulo="Puesto">
                  <Kv k="Cargo" v={v(emp.cargo)} />
                  <Kv k="Categoría / Nivel" v={v(emp.categoria_nivel)} />
                  <Kv k="Tipo empleado" v={v(emp.tipo_empleado)} />
                  <Kv k="Estado" v={v(estadoLabel)} />
                </Bloque>
                <Bloque titulo="Contrato">
                  <Kv k="Tipo de contrato" v={v(emp.tipo_contrato)} />
                  <Kv k="Jornada laboral" v={v(emp.jornada_laboral)} />
                  <Kv k="Tipo de periodo" v={v(emp.tipo_periodo)} />
                </Bloque>
                <Bloque titulo="Alta / baja">
                  <Kv k="Fecha ingreso" v={fmtFecha(emp.fecha_ingreso)} />
                  <Kv k="Fecha baja" v={fmtFecha(emp.fecha_baja)} />
                </Bloque>
                <Bloque titulo="Organización">
                  <Kv k="Sucursal" v={v(emp.sucursal)} />
                  <Kv k="Departamento" v={v(emp.departamento)} />
                  <Kv k="Sección" v={v(emp.seccion)} />
                  <Kv k="Supervisor" v={v(emp.supervisor)} />
                </Bloque>
                <Bloque titulo="Seguridad Social (España)">
                  <Kv k="Afiliación S.S." v={v(emp.afiliacion_ss)} />
                  <Kv k="Grupo cotización" v={v(emp.grupo_cotizacion)} />
                </Bloque>
                <Bloque titulo="Bancario">
                  <Kv k="Banco" v={v(emp.banco)} />
                  <Kv k="Nº de cuenta" v={v(emp.numero_cuenta)} />
                </Bloque>
              </div>
              <EspecialidadesEmpleado empleadoId={emp.id} />
            </div>
          )}

          {tab === "salario" && permisos["salarios.ver"] && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                El historial completo de tramos salariales vive en su propia página.
              </p>
              <Link href={`/rrhh/empleados/${emp.id}/salarios`}
                className="inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F9EA2]">
                → Abrir historial salarial
              </Link>
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valores denormalizados (ficha)</h4>
                <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-slate-500">Salario base:</span> <strong>{fmtMoney(emp.salario_base)}</strong></div>
                  <div><span className="text-slate-500">Complementario:</span> <strong>{fmtMoney(emp.salario_complementario)}</strong></div>
                  <div><span className="text-slate-500">Costo/hora:</span> <strong>{fmtMoney(emp.costo_hora)}</strong></div>
                </div>
              </div>
            </div>
          )}

          {tab === "documentos" && <DocumentacionEmpleado empleadoId={emp.id} />}
          {tab === "cursos" && <CursosEmpleado empleadoId={emp.id} />}

          {tab === "vacaciones" && (
            <div className="space-y-4">
              <ResumenVacacionesEmpleado empleadoId={emp.id} />
              <Link href={`/rrhh/vacaciones?empleadoId=${emp.id}`}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                → Ver todas las solicitudes
              </Link>
            </div>
          )}

          {tab === "marcaciones" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Últimos 30 días</h3>
                <div className="text-sm text-slate-600">
                  Total horas: <strong>{totalHorasMes.toFixed(1)}</strong>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Fecha</th>
                      <th className="px-4 py-2 font-semibold">Entrada</th>
                      <th className="px-4 py-2 font-semibold">Salida</th>
                      <th className="px-4 py-2 font-semibold text-right">Horas</th>
                      <th className="px-4 py-2 font-semibold">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fichajes.length === 0 ? (
                      <tr><td colSpan={5} className="py-6 text-center text-slate-400">Sin marcaciones en los últimos 30 días</td></tr>
                    ) : fichajes.map((f, i) => (
                      <tr key={i}>
                        <td className="px-4 py-1.5">{fmtFecha(f.fecha)}</td>
                        <td className="px-4 py-1.5">{fmtHora(f.hora_entrada)}</td>
                        <td className="px-4 py-1.5">{fmtHora(f.hora_salida)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{f.horas !== null ? Number(f.horas).toFixed(2) : "—"}</td>
                        <td className="px-4 py-1.5 text-slate-600 text-xs">{f.observacion ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <a href={`/api/rrhh/fichajes/reporte-pdf?empleadoId=${emp.id}&desde=${new Date(Date.now() - 30*86400000).toISOString().slice(0,10)}&hasta=${new Date().toISOString().slice(0,10)}`}
                 target="_blank" rel="noreferrer"
                 className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                📄 Reporte PDF (últimos 30 días)
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Bloque({ titulo, children, span }: { titulo: string; children: React.ReactNode; span?: number }) {
  return (
    <section className={span === 2 ? "md:col-span-2" : span === 3 ? "md:col-span-3" : ""}>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{titulo}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}
function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-40 shrink-0 text-slate-500 text-xs">{k}</span>
      <span className="text-slate-800">{v}</span>
    </div>
  );
}
