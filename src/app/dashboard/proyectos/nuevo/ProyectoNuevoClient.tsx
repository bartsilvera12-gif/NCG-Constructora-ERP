"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ClienteSearchSelect } from "@/app/dashboard/proyectos/components/ClienteSearchSelect";
import {
  ProyectoModuloSelector,
  type ProyectoModuloCatalogo as ModuloCatalogo,
} from "@/app/dashboard/proyectos/components/ProyectoModuloSelector";
import {
  PROYECTO_WEB_BRIEF_FIELDS,
  PROYECTO_ENTREGA_BRIEF_FIELDS,
  applySaasFormToExisting,
  type ProyectoModuloSnapshot,
} from "@/lib/proyectos/brief-data";

type Tipo = { id: string; nombre: string; codigo: string };
type Estado = { id: string; nombre: string };
type Cliente = { id: string; empresa?: string | null; nombre_contacto?: string | null };
type Usuario = { id: string; nombre?: string | null };
type Empleado = {
  id: string;
  nombre: string;
  cargo?: string | null;
  activo?: boolean;
  /** Tipos asignados desde la ficha del empleado (RRHH → Empleados). Reemplaza
   *  a la tabla legacy asignaciones_tipo_empleado pero la mantenemos como
   *  fallback hasta que todos los empleados tengan los tipos cargados acá. */
  tipos_empleado?: string[] | null;
};
type Asignacion = { empleado_id: string | null; tipos: string[] | null; activo: boolean };

/**
 * Slugs del catálogo de tipos que se consideran "comercial" o "técnico" para
 * filtrar los empleados en los selectores Resp. comercial / Resp. técnico.
 */
// Cobrador queda fuera: pertenece a cobranzas, no al area comercial.
const SLUGS_COMERCIAL = new Set(["vendedor", "comercial", "asesor"]);
const SLUGS_TECNICO = new Set(["tecnico", "técnico"]);

export default function ProyectoNuevoClient() {
  const router = useRouter();
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [modulosCatalogo, setModulosCatalogo] = useState<ModuloCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tipoId, setTipoId] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("normal");
  const [rc, setRc] = useState("");
  const [rt, setRt] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaProm, setFechaProm] = useState("");
  const [brief, setBrief] = useState<Record<string, string>>({});
  const [saasEmpresaNombre, setSaasEmpresaNombre] = useState("");
  const [saasWhatsapp, setSaasWhatsapp] = useState("");
  const [saasObservaciones, setSaasObservaciones] = useState("");
  const [saasModuloIds, setSaasModuloIds] = useState<string[]>([]);

  // Alta rápida de tipo de proyecto desde el selector.
  const [creandoTipo, setCreandoTipo] = useState(false);
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState("");
  const [guardandoTipo, setGuardandoTipo] = useState(false);

  async function crearTipo() {
    const nombre = nuevoTipoNombre.trim();
    if (!nombre) return;
    setGuardandoTipo(true);
    try {
      const r = await fetchWithSupabaseSession("/api/proyectos/tipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Tipo; error?: string };
      if (!r.ok || !j.success || !j.data) {
        setErr(j.error ?? "No se pudo crear el tipo");
        return;
      }
      const nuevo = j.data;
      setTipos((prev) => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setTipoId(nuevo.id);
      setNuevoTipoNombre("");
      setCreandoTipo(false);
      setErr(null);
    } finally {
      setGuardandoTipo(false);
    }
  }

  const tipoCodigo = useMemo(() => tipos.find((t) => t.id === tipoId)?.codigo ?? "", [tipos, tipoId]);

  /** Empleados activos elegibles para "Resp. comercial" / "Resp. técnico".
   *  Fuente primaria: empleado.tipos_empleado (cargado en la ficha de RRHH).
   *  Fallback: asignaciones_tipo_empleado (tabla legacy) hasta que todos los
   *  empleados tengan los tipos en la ficha. */
  const empleadosComerciales = useMemo(() => {
    const idsAsig = new Set(
      asignaciones
        .filter((a) => a.activo && (a.tipos ?? []).some((t) => SLUGS_COMERCIAL.has(t)))
        .map((a) => a.empleado_id)
        .filter((v): v is string => Boolean(v)),
    );
    return empleados.filter((e) => {
      if (e.activo === false) return false;
      const propios = e.tipos_empleado ?? [];
      if (propios.some((t) => SLUGS_COMERCIAL.has(t))) return true;
      return idsAsig.has(e.id);
    });
  }, [empleados, asignaciones]);

  const empleadosTecnicos = useMemo(() => {
    const idsAsig = new Set(
      asignaciones
        .filter((a) => a.activo && (a.tipos ?? []).some((t) => SLUGS_TECNICO.has(t)))
        .map((a) => a.empleado_id)
        .filter((v): v is string => Boolean(v)),
    );
    return empleados.filter((e) => {
      if (e.activo === false) return false;
      const propios = e.tipos_empleado ?? [];
      if (propios.some((t) => SLUGS_TECNICO.has(t))) return true;
      return idsAsig.has(e.id);
    });
  }, [empleados, asignaciones]);
  const esWeb = tipoCodigo === "web";
  const esSaas = tipoCodigo === "saas";
  const saasModulosSeleccionados = useMemo<ProyectoModuloSnapshot[]>(
    () =>
      modulosCatalogo
        .filter((modulo) => saasModuloIds.includes(modulo.id))
        .map((modulo) => ({ id: modulo.id, slug: modulo.slug, nombre: modulo.nombre })),
    [modulosCatalogo, saasModuloIds]
  );

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [rT, rE, rC, rU, rM, rEmp, rAsig] = await Promise.all([
        fetchWithSupabaseSession("/api/proyectos/tipos", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/clientes", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/modulos-catalogo", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/rrhh/empleados", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/rrhh/asignaciones-tipo", { cache: "no-store" }),
      ]);
      const jT = (await rT.json()) as { success?: boolean; data?: Tipo[] };
      const jE = (await rE.json()) as { success?: boolean; data?: Estado[] };
      const jC = (await rC.json()) as { success?: boolean; data?: Cliente[] };
      const jUsers = (await rU.json()) as { usuarios?: Usuario[] };
      const jModulos = (await rM.json()) as { success?: boolean; data?: ModuloCatalogo[] };
      const jEmp = (await rEmp.json()) as { success?: boolean; data?: { empleados?: Empleado[] } };
      const jAsig = (await rAsig.json()) as { success?: boolean; data?: { asignaciones?: Asignacion[] } };
      if (cancel) return;
      if (jT.success && jT.data) {
        setTipos(jT.data);
        const web = jT.data.find((t) => t.codigo === "web");
        if (web) setTipoId(web.id);
      }
      if (jE.success && jE.data) setEstados(jE.data);
      if (jC.success && jC.data) setClientes(jC.data);
      setUsuarios(jUsers.usuarios ?? []);
      if (jModulos.success && jModulos.data) setModulosCatalogo(jModulos.data);
      if (jEmp.success) setEmpleados(jEmp.data?.empleados ?? []);
      if (jAsig.success) setAsignaciones(jAsig.data?.asignaciones ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const brief_data = esWeb
      ? Object.fromEntries(
          PROYECTO_WEB_BRIEF_FIELDS.map(({ key }) => [key, brief[key] ?? ""]).filter(([, v]) => v !== "")
        )
      : esSaas
        ? applySaasFormToExisting(
            {},
            {
              empresa_nombre: saasEmpresaNombre,
              whatsapp_contacto: saasWhatsapp,
              observaciones: saasObservaciones,
              modulos_necesarios: saasModulosSeleccionados,
            }
          )
        : Object.fromEntries(
            PROYECTO_ENTREGA_BRIEF_FIELDS.map(({ key }) => [key, brief[key] ?? ""]).filter(([, v]) => v !== "")
          );

    const body: Record<string, unknown> = {
      tipo_id: tipoId,
      titulo,
      descripcion: descripcion || null,
      prioridad,
      cliente_id: clienteId || null,
      responsable_comercial_id: rc || null,
      responsable_tecnico_id: rt || null,
      fecha_ingreso: new Date(fechaIngreso + "T12:00:00").toISOString(),
      fecha_prometida: fechaProm ? new Date(fechaProm + "T12:00:00").toISOString() : null,
      brief_data,
    };
    if (estadoId) body.estado_id = estadoId;

    const res = await fetchWithSupabaseSession("/api/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { success?: boolean; data?: { id?: string }; error?: string };
    setSaving(false);
    if (!res.ok || !j.success || !j.data?.id) {
      setErr(j.error ?? "No se pudo crear");
      return;
    }
    router.push(`/dashboard/proyectos/${j.data.id}`);
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Cargando…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/proyectos" className="text-sm text-indigo-600 hover:underline">
          ← Volver
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-slate-900">Nuevo pedido</h1>

      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}

      <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Título</span>
            <input
              required
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>
          <div className="block text-sm">
            <span className="font-medium text-slate-700">Tipo</span>
            <select
              required
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={creandoTipo ? "__nuevo__" : tipoId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__nuevo__") {
                  setCreandoTipo(true);
                  setTipoId("");
                } else {
                  setCreandoTipo(false);
                  setTipoId(v);
                }
              }}
            >
              <option value="">Seleccionar…</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
              <option value="__nuevo__">+ Agregar nuevo tipo…</option>
            </select>
            {creandoTipo && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2">
                <input
                  autoFocus
                  className="min-w-0 flex-1 basis-48 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Nombre del nuevo tipo (ej. Reforma, Mantenimiento)"
                  value={nuevoTipoNombre}
                  onChange={(e) => setNuevoTipoNombre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void crearTipo(); }
                    if (e.key === "Escape") { setCreandoTipo(false); setNuevoTipoNombre(""); }
                  }}
                />
                <button type="button" onClick={() => void crearTipo()} disabled={guardandoTipo || !nuevoTipoNombre.trim()}
                  className="rounded-md bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {guardandoTipo ? "Creando…" : "Crear"}
                </button>
                <button type="button" onClick={() => { setCreandoTipo(false); setNuevoTipoNombre(""); }}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
                  Cancelar
                </button>
              </div>
            )}
          </div>
          <ClienteSearchSelect clientes={clientes} value={clienteId} onChange={setClienteId} />
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Estado inicial (opcional)</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={estadoId}
              onChange={(e) => setEstadoId(e.target.value)}
            >
              <option value="">Predeterminado de empresa</option>
              {estados.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Prioridad</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value)}
            >
              <option value="baja">Baja</option>
              <option value="normal">Media</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Resp. comercial</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={rc}
              onChange={(e) => setRc(e.target.value)}
            >
              <option value="">—</option>
              {empleadosComerciales.length === 0 ? (
                <option value="" disabled>Sin empleados comerciales asignados</option>
              ) : (
                empleadosComerciales.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}{e.cargo ? ` — ${e.cargo}` : ""}
                  </option>
                ))
              )}
            </select>
            {empleadosComerciales.length === 0 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Asigná el tipo &quot;Vendedor&quot; al empleado en su ficha (RRHH → Empleados → Tipo(s) de empleado).
              </p>
            )}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Resp. técnico</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={rt}
              onChange={(e) => setRt(e.target.value)}
            >
              <option value="">—</option>
              {empleadosTecnicos.length === 0 ? (
                <option value="" disabled>Sin empleados técnicos asignados</option>
              ) : (
                empleadosTecnicos.map((e) => (
                  <option key={`t-${e.id}`} value={e.id}>
                    {e.nombre}{e.cargo ? ` — ${e.cargo}` : ""}
                  </option>
                ))
              )}
            </select>
            {empleadosTecnicos.length === 0 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Asigná el tipo &quot;Técnico&quot; al empleado en su ficha (RRHH → Empleados → Tipo(s) de empleado).
              </p>
            )}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Fecha ingreso</span>
            <input
              type="date"
              required
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Fecha prometida</span>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={fechaProm}
              onChange={(e) => setFechaProm(e.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Descripción breve</span>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>

        {/* Sección 'Datos del proyecto (web)' removida — no aplica al rubro construcción. */}

        {!esWeb && !esSaas ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <h2 className="text-sm font-semibold text-slate-800">Datos de entrega</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {PROYECTO_ENTREGA_BRIEF_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className={`block text-sm ${f.key === "observaciones_entrega" ? "sm:col-span-2" : ""}`}
                >
                  <span className="text-slate-700">{f.label}</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder={f.kind === "text" ? f.placeholder : undefined}
                    value={brief[f.key] ?? ""}
                    onChange={(e) => setBrief((b) => ({ ...b, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {esSaas ? (
          <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
            <h2 className="text-sm font-semibold text-emerald-900">Datos del ERP / SaaS</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-700">Nombre de la empresa</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={saasEmpresaNombre}
                  onChange={(e) => setSaasEmpresaNombre(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-700">WhatsApp contacto</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="+595..."
                  value={saasWhatsapp}
                  onChange={(e) => setSaasWhatsapp(e.target.value)}
                />
              </label>
              <div className="block text-sm sm:col-span-2">
                <span className="text-slate-700">Módulos necesarios</span>
                <div className="mt-1">
                  <ProyectoModuloSelector
                    modulos={modulosCatalogo}
                    selectedIds={saasModuloIds}
                    onChange={setSaasModuloIds}
                  />
                </div>
              </div>
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-700">Observaciones</span>
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                  value={saasObservaciones}
                  onChange={(e) => setSaasObservaciones(e.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Crear proyecto"}
        </button>
      </form>
    </div>
  );
}
