"use client";

import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { readSaasBriefData } from "@/lib/proyectos/brief-data";
import ProyectoDetalleModal from "./components/ProyectoDetalleModal";
import PageHeader from "@/components/ui/PageHeader";

type EstadoRow = {
  id: string;
  nombre: string;
  codigo: string;
  color: string;
  sort_order: number;
  cuenta_sla?: boolean;
  sla_horas_objetivo?: number | null;
  es_estado_final?: boolean;
  inactiveFallback?: boolean;
};

type ProyectoCard = Record<string, unknown> & {
  id: string;
  titulo: string;
  prioridad: string;
  estado_id: string;
  last_activity_at?: string;
  fecha_ingreso?: string;
  fecha_prometida?: string | null;
  brief_data?: Record<string, unknown> | null;
  bloqueado?: boolean;
  archivado?: boolean;
  proyecto_tipo?: { nombre?: string; codigo?: string } | null;
  proyecto_estado?: {
    nombre?: string;
    codigo?: string;
    color?: string;
    cuenta_sla?: boolean;
    sla_horas_objetivo?: number | null;
    es_estado_final?: boolean;
  } | null;
  cliente?: { empresa?: string | null; nombre_contacto?: string | null } | null;
  responsable_comercial?: { nombre?: string | null } | null;
  responsable_tecnico?: { nombre?: string | null } | null;
  tiempo_en_estado_segundos?: number | null;
  sla_estado_actual?: {
    cuenta_sla: boolean;
    objetivo_horas: number | null;
    vencido: boolean;
    restante_segundos: number | null;
    excedido_segundos: number | null;
  };
};

type PrioridadConfig = {
  codigo: string;
  nombre: string;
  color: string | null;
  bg_color: string | null;
  text_color: string | null;
  border_color: string | null;
  sort_order: number;
  activo: boolean;
};

type ProjectCardViewProps = {
  p: ProyectoCard;
  estados: EstadoRow[];
  estadoActivoIds: Set<string>;
  prioridadConfig?: PrioridadConfig;
  onOpen: (id: string) => void;
  onMove: (proyectoId: string, estadoId: string) => void;
  moving?: boolean;
  dragOverlay?: boolean;
};

type KanbanColumnViewProps = {
  col: EstadoRow;
  children: ReactNode;
};

const PROJECT_DRAG_PREFIX = "project:";
const COLUMN_DROP_PREFIX = "estado:";

function projectDragId(projectId: string): string {
  return `${PROJECT_DRAG_PREFIX}${projectId}`;
}

function estadoDropId(estadoId: string): string {
  return `${COLUMN_DROP_PREFIX}${estadoId}`;
}

function readProjectIdFromDragId(id: unknown): string | null {
  const raw = String(id ?? "");
  return raw.startsWith(PROJECT_DRAG_PREFIX) ? raw.slice(PROJECT_DRAG_PREFIX.length) : null;
}

function readEstadoIdFromDropId(id: unknown): string | null {
  const raw = String(id ?? "");
  return raw.startsWith(COLUMN_DROP_PREFIX) ? raw.slice(COLUMN_DROP_PREFIX.length) : null;
}

type PriorityCardStyles = {
  cardAccentClass: string;
  badgeClass: string;
  iconDotClass: string;
};

function getPriorityCardStyles(prioridad: string | null | undefined): PriorityCardStyles {
  if (prioridad === "baja") {
    return {
      cardAccentClass: "border-l-emerald-500 hover:border-emerald-200",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconDotClass: "bg-emerald-500",
    };
  }
  if (prioridad === "alta") {
    return {
      cardAccentClass: "border-l-orange-500 hover:border-orange-200",
      badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
      iconDotClass: "bg-orange-500",
    };
  }
  if (prioridad === "urgente") {
    return {
      cardAccentClass: "border-l-rose-600 hover:border-rose-200",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      iconDotClass: "bg-rose-600",
    };
  }
  if (prioridad === "normal" || prioridad === "media") {
    return {
      cardAccentClass: "border-l-sky-500 hover:border-sky-200",
      badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
      iconDotClass: "bg-sky-500",
    };
  }
  return {
    cardAccentClass: "border-l-slate-300 hover:border-slate-300",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
    iconDotClass: "bg-slate-400",
  };
}

function prioridadFallbackLabel(p: string): string {
  if (p === "normal") return "Media";
  if (p === "alta") return "Alta";
  if (p === "urgente") return "Urgente";
  if (p === "baja") return "Baja";
  return p;
}

function formatSlaDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const totalHours = Math.max(0, Math.floor(seconds / 3600));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  return `${hours}h`;
}

function formatSlaTarget(hours: number | null | undefined): string | null {
  if (hours == null || !Number.isFinite(hours)) return null;
  return formatSlaDuration(hours * 3600);
}

function slaEstadoLabel(p: ProyectoCard): string {
  const sla = p.sla_estado_actual;
  if (!sla?.cuenta_sla) return "SLA —";
  if (sla.vencido) return `SLA vencido: +${formatSlaDuration(sla.excedido_segundos)}`;
  const elapsed = formatSlaDuration(p.tiempo_en_estado_segundos);
  const target = formatSlaTarget(sla.objetivo_horas);
  return target ? `SLA: ${elapsed} / ${target}` : `SLA: ${elapsed}`;
}

function saasModuleCountLabel(p: ProyectoCard): string | null {
  if (p.proyecto_tipo?.codigo !== "saas") return null;
  const count = readSaasBriefData(p.brief_data).modulos_necesarios.length;
  if (count <= 0) return null;
  return count === 1 ? "1 módulo" : `${count} módulos`;
}

// ── Pedidos (gastronomía) — helpers para renderizar cards con brief_data del pedido ─────
type PedidoBrief = {
  // null = pedido de distribuidora (creado desde una venta, sin modalidad gastronómica).
  modalidad: "local" | "delivery" | "carry_out" | null;
  mesa: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  direccion_entrega: string | null;
  observacion: string | null;
  numero_control: string | null;
  items: Array<{ producto_nombre: string; cantidad: number }>;
};

function readPedidoBrief(
  brief: Record<string, unknown> | null | undefined
): PedidoBrief | null {
  if (!brief || typeof brief !== "object") return null;
  // Obras NCG generadas desde presupuesto o venta de obra usan el mismo brief
  // con items (las partidas), pero deben renderizarse como proyecto común
  // (cliente, responsables, SLA, fechas), no como pedido de distribuidora.
  const source = typeof brief.source === "string" ? brief.source : null;
  if (source === "presupuesto_obra" || source === "venta_obra") return null;
  const m = (brief as Record<string, unknown>).modalidad;
  const modalidad = m === "local" || m === "delivery" || m === "carry_out" ? m : null;
  const itemsRaw = Array.isArray(brief.items) ? (brief.items as Array<Record<string, unknown>>) : [];
  const numeroControl = typeof brief.numero_control === "string" ? brief.numero_control : null;
  // Es un pedido renderizable si tiene modalidad (gastronomía) o si proviene de una
  // venta (distribuidora): hay items o número de control. Si no, es un proyecto común.
  if (modalidad === null && itemsRaw.length === 0 && !numeroControl) return null;
  return {
    modalidad,
    mesa: typeof brief.mesa === "string" ? brief.mesa : null,
    cliente_nombre: typeof brief.cliente_nombre === "string" ? brief.cliente_nombre : null,
    cliente_telefono: typeof brief.cliente_telefono === "string" ? brief.cliente_telefono : null,
    direccion_entrega: typeof brief.direccion_entrega === "string" ? brief.direccion_entrega : null,
    observacion: typeof brief.observacion === "string" ? brief.observacion : null,
    numero_control: typeof brief.numero_control === "string" ? brief.numero_control : null,
    items: itemsRaw.map((it) => ({
      producto_nombre: typeof it.producto_nombre === "string" ? it.producto_nombre : "—",
      cantidad: typeof it.cantidad === "number" ? it.cantidad : Number(it.cantidad) || 0,
    })),
  };
}

const PEDIDO_MODALIDAD_BADGE: Record<
  "local" | "delivery" | "carry_out",
  { label: string; cls: string }
> = {
  local:     { label: "En local",  cls: "border-amber-300 bg-amber-50 text-amber-800" },
  delivery:  { label: "Delivery",  cls: "border-purple-300 bg-purple-50 text-purple-800" },
  carry_out: { label: "Retiro",    cls: "border-sky-300 bg-sky-50 text-sky-800" },
};

function fmtPedidoTotal(n: number | string | null | undefined): string {
  if (n == null) return "—";
  const v = typeof n === "string" ? Number(n) : n;
  return "€ " + (v || 0).toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtPedidoHora(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

type TipoRow = { id: string; nombre: string; codigo: string };
type UsuarioRow = { id: string; nombre: string | null; email: string };

export default function ProyectosKanbanClient() {
  const [estados, setEstados] = useState<EstadoRow[]>([]);
  const [tipos, setTipos] = useState<TipoRow[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoCard[]>([]);
  const [prioridadesConfig, setPrioridadesConfig] = useState<PrioridadConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);
  const [activeDragProjectId, setActiveDragProjectId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroRc, setFiltroRc] = useState("");
  const [filtroRt, setFiltroRt] = useState("");
  const [modalProjectId, setModalProjectId] = useState<string | null>(null);

  // Catálogos para los filtros (cargan una vez).
  useEffect(() => {
    void fetchWithSupabaseSession("/api/proyectos/tipos", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: TipoRow[] };
        if (r.ok && j.success && Array.isArray(j.data)) setTipos(j.data);
      })
      .catch(() => { /* sin tipos */ });
    void fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { usuarios?: UsuarioRow[] };
        if (r.ok && Array.isArray(j.usuarios)) setUsuarios(j.usuarios);
      })
      .catch(() => { /* sin usuarios */ });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (filtroEstado) sp.set("estado_id", filtroEstado);
    if (filtroTipo) sp.set("tipo_id", filtroTipo);
    if (filtroRc) sp.set("responsable_comercial_id", filtroRc);
    if (filtroRt) sp.set("responsable_tecnico_id", filtroRt);

    // Críticos para pintar el board: estados (columnas) + proyectos (cards).
    // Antes se pedían 5 endpoints en paralelo y el board esperaba al MÁS LENTO
    // (~2.2s). Optimización: `tipos` y `empresa-activos` se removieron (sus
    // resultados no se renderizaban en ningún lado) y `prioridades` se difiere
    // (solo afecta el color/etiqueta de prioridad de las cards).
    const [rEst, rPr] = await Promise.all([
      fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
      fetchWithSupabaseSession(`/api/proyectos?${sp.toString()}`, { cache: "no-store" }),
    ]);

    const jEst = (await rEst.json().catch(() => ({}))) as { success?: boolean; data?: EstadoRow[]; error?: string };
    const jPr = (await rPr.json().catch(() => ({}))) as { success?: boolean; data?: ProyectoCard[]; error?: string };

    if (!rEst.ok || !jEst.success) {
      setErr(jEst.error ?? "No se pudieron cargar estados");
      setLoading(false);
      return;
    }
    if (!rPr.ok || !jPr.success) {
      setErr(jPr.error ?? "No se pudieron cargar proyectos");
      setLoading(false);
      return;
    }
    setEstados(jEst.data ?? []);
    setProyectos(jPr.data ?? []);
    setLoading(false); // el board ya puede renderizar (sin esperar config no crítica)

    // No crítico: config de prioridades (solo el color/etiqueta de prioridad en
    // las cards). Se difiere para no retrasar el board; hasta que llega, las
    // cards usan su fallback de prioridad.
    void fetchWithSupabaseSession("/api/configuracion/proyectos/prioridades", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { prioridades?: PrioridadConfig[] };
        };
        if (r.ok && j.success && j.data?.prioridades) setPrioridadesConfig(j.data.prioridades);
      })
      .catch(() => {
        /* sin config: las cards usan el fallback de prioridad */
      });
  }, [q, filtroEstado, filtroTipo, filtroRc, filtroRt]);

  useEffect(() => {
    void load();
  }, [load]);

  const estadoActivoIds = useMemo(() => new Set(estados.map((e) => e.id)), [estados]);

  const kanbanColumns = useMemo(() => {
    const columns = [...estados];
    const missing = new Map<string, EstadoRow>();
    for (const p of proyectos) {
      if (estadoActivoIds.has(p.estado_id) || missing.has(p.estado_id)) continue;
      missing.set(p.estado_id, {
        id: p.estado_id,
        nombre: `Oculto / no usado: ${p.proyecto_estado?.nombre ?? "Estado sin configurar"}`,
        codigo: p.proyecto_estado?.codigo ?? "estado_inactivo",
        color: p.proyecto_estado?.color ?? "#94a3b8",
        sort_order: 9999,
        inactiveFallback: true,
      });
    }
    return [...columns, ...missing.values()];
  }, [estadoActivoIds, estados, proyectos]);

  const byColumn = useMemo(() => {
    const m = new Map<string, ProyectoCard[]>();
    for (const e of kanbanColumns) m.set(e.id, []);
    for (const p of proyectos) {
      const col = m.get(p.estado_id);
      if (col) col.push(p);
    }
    return m;
  }, [kanbanColumns, proyectos]);

  const prioridadByCodigo = useMemo(() => {
    const m = new Map<string, PrioridadConfig>();
    for (const prioridad of prioridadesConfig) {
      if (prioridad.activo) m.set(prioridad.codigo, prioridad);
    }
    return m;
  }, [prioridadesConfig]);

  const activeDragProject = useMemo(
    () => proyectos.find((p) => p.id === activeDragProjectId) ?? null,
    [activeDragProjectId, proyectos]
  );

  async function cambiarEstado(proyectoId: string, estadoId: string): Promise<boolean> {
    if (!estadoActivoIds.has(estadoId)) {
      setErr("No se puede mover a una columna inactiva.");
      return false;
    }

    const currentProject = proyectos.find((p) => p.id === proyectoId);
    if (!currentProject) {
      setErr("No se encontró el proyecto a mover.");
      return false;
    }
    if (currentProject.estado_id === estadoId) return true;

    const previousProjects = proyectos;
    const destino = estados.find((e) => e.id === estadoId);
    setErr(null);
    setMovingProjectId(proyectoId);
    setProyectos((prev) =>
      prev.map((p) =>
        p.id === proyectoId
          ? {
              ...p,
              estado_id: estadoId,
              proyecto_estado: destino
                ? {
                    ...(p.proyecto_estado ?? {}),
                    nombre: destino.nombre,
                    codigo: destino.codigo,
                    color: destino.color,
                    cuenta_sla: destino.cuenta_sla,
                    sla_horas_objetivo: destino.sla_horas_objetivo,
                    es_estado_final: destino.es_estado_final ?? p.proyecto_estado?.es_estado_final,
                  }
                : p.proyecto_estado,
            }
          : p
      )
    );

    try {
      const res = await fetchWithSupabaseSession(`/api/proyectos/${proyectoId}/cambiar-estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_id: estadoId }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setProyectos(previousProjects);
        setErr(j.error ?? "No se pudo cambiar el estado. La tarjeta volvió a su columna anterior.");
        setMovingProjectId(null);
        return false;
      }
      setMovingProjectId(null);
      await load();
      return true;
    } catch (e) {
      setProyectos(previousProjects);
      setErr(
        e instanceof Error
          ? `${e.message}. La tarjeta volvió a su columna anterior.`
          : "No se pudo cambiar el estado. La tarjeta volvió a su columna anterior."
      );
      setMovingProjectId(null);
      return false;
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragProjectId(readProjectIdFromDragId(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const proyectoId = readProjectIdFromDragId(event.active.id);
    const estadoId = readEstadoIdFromDropId(event.over?.id);
    setActiveDragProjectId(null);

    if (!proyectoId || !estadoId) return;
    void cambiarEstado(proyectoId, estadoId);
  }

  if (loading && proyectos.length === 0 && estados.length === 0) {
    return <div className="p-6 text-sm text-slate-500">Cargando proyectos…</div>;
  }

  if (err && proyectos.length === 0) {
    return <div className="p-6 text-sm text-red-600">{err}</div>;
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-4 md:p-6">
      <PageHeader
        eyebrow="Tablero"
        title="Proyectos"
        description="Kanban configurable por empresa — producción, clientes y SLA."
        actions={
          <Link
            href="/dashboard/proyectos/nuevo"
            className="inline-flex items-center gap-2 rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#3F8E91]"
          >
            <span className="text-lg leading-none">+</span> Nuevo proyecto
          </Link>
        }
      />

      {err ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div> : null}

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-full gap-2">
          {estados.map((estado) => (
            <EstadoMetric
              key={estado.id}
              label={estado.nombre}
              value={byColumn.get(estado.id)?.length ?? 0}
              color={estado.color}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <input
          className="min-w-0 flex-1 basis-48 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#4FAEB2]/50 focus:ring-2 focus:ring-[#4FAEB2]/30"
          placeholder="Buscar título o cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
        />
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Buscar
        </button>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="min-w-0 flex-1 basis-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">Todos los estados</option>
          {estados.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="min-w-0 flex-1 basis-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
        <select
          value={filtroRc}
          onChange={(e) => setFiltroRc(e.target.value)}
          className="min-w-0 flex-1 basis-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">Resp. comercial</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre ?? u.email}</option>
          ))}
        </select>
        <select
          value={filtroRt}
          onChange={(e) => setFiltroRt(e.target.value)}
          className="min-w-0 flex-1 basis-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">Resp. técnico</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre ?? u.email}</option>
          ))}
        </select>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Antes: "overflow-x-hidden" bloqueaba el scroll horizontal del kanban,
            las columnas se comprimian a flex-1 y en mobile quedaban ilegibles
            (texto de tarjetas cortado, no se ven todas las columnas).
            Ahora: "overflow-auto" cubre X+Y, cada KanbanColumnView tiene
            min-w-[260px] fijo (no flex-1), el contenedor crece con el contenido
            y el usuario puede deslizar de izquierda a derecha. */}
        <div className="max-h-[calc(100vh-260px)] min-h-[520px] overflow-auto rounded-xl pb-4 overscroll-x-contain">
          <div className="flex min-h-full gap-2">
            {kanbanColumns.map((col) => {
              const items = byColumn.get(col.id) ?? [];
              return (
                <KanbanColumnView key={col.id} col={col}>
                  <div
                    className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 shadow-sm"
                    style={{ borderTopColor: col.color, borderTopWidth: 3 }}
                  >
                    <span className="text-sm font-semibold text-slate-800">{col.nombre}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{items.length}</span>
                  </div>
                  {col.inactiveFallback ? (
                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Esta columna está inactiva, pero contiene proyectos. Movelos a una columna activa.
                    </div>
                  ) : null}
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {items.map((p) => (
                      <ProjectCardView
                        key={p.id}
                        p={p}
                        estados={estados}
                        estadoActivoIds={estadoActivoIds}
                        prioridadConfig={prioridadByCodigo.get(p.prioridad)}
                        onOpen={setModalProjectId}
                        onMove={(proyectoId, estadoId) => void cambiarEstado(proyectoId, estadoId)}
                        moving={movingProjectId === p.id}
                      />
                    ))}
                    {items.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">Soltá tarjetas acá</div>
                    ) : null}
                  </div>
                </KanbanColumnView>
              );
            })}
          </div>
        </div>
        <DragOverlay>
          {activeDragProject ? (
            <ProjectCardView
              p={activeDragProject}
              estados={estados}
              estadoActivoIds={estadoActivoIds}
              prioridadConfig={prioridadByCodigo.get(activeDragProject.prioridad)}
              onOpen={() => undefined}
              onMove={() => undefined}
              dragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="text-center text-xs text-slate-400">
        Arrastrá tarjetas entre columnas activas o usá el selector “Mover a” como alternativa.
      </p>

      <ProyectoDetalleModal
        projectId={modalProjectId}
        open={modalProjectId != null}
        onClose={() => setModalProjectId(null)}
        onUpdated={() => void load()}
      />
    </div>
  );
}

function KanbanColumnView({ col, children }: KanbanColumnViewProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: estadoDropId(col.id),
    disabled: col.inactiveFallback === true,
    data: { estadoId: col.id, active: col.inactiveFallback !== true },
  });

  return (
    <div
      ref={setNodeRef}
      // Antes: "min-w-[120px] flex-1" => columnas compartian el ancho disponible,
      // imposibles de leer en mobile. Ahora: ancho fijo de 260px (sin flex-1)
      // para que el contenedor scrollee horizontalmente con todas las columnas
      // legibles. shrink-0 evita que se compriman.
      className={`flex w-[260px] shrink-0 flex-col rounded-lg border bg-slate-50/80 transition-colors ${
        isOver && !col.inactiveFallback
          ? "border-indigo-300 bg-indigo-50/70 ring-2 ring-indigo-100"
          : "border-slate-200"
      }`}
    >
      {children}
    </div>
  );
}

function ProjectCardView({
  p,
  estados,
  estadoActivoIds,
  prioridadConfig,
  onOpen,
  onMove,
  moving,
  dragOverlay,
}: ProjectCardViewProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: projectDragId(p.id),
    disabled: dragOverlay === true,
    data: { projectId: p.id, estadoId: p.estado_id },
  });

  const cli =
    (p.cliente?.empresa || "").trim() ||
    (p.cliente?.nombre_contacto || "").trim() ||
    "Sin cliente";
  const saasModulesLabel = saasModuleCountLabel(p);
  const priorityStyles = getPriorityCardStyles(p.prioridad);
  const pedido = readPedidoBrief(p.brief_data);

  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const baseBadgeClass =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4";
  const neutralBadgeClass =
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-slate-600";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`touch-none rounded-xl border border-l-4 bg-white p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        dragOverlay ? "rotate-1 cursor-grabbing shadow-2xl" : "cursor-grab active:cursor-grabbing"
      } ${priorityStyles.cardAccentClass} ${isDragging ? "opacity-40" : ""} ${moving ? "ring-2 ring-sky-100" : ""}`}
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => {
          if (!dragOverlay) onOpen(p.id);
        }}
      >
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityStyles.iconDotClass}`} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-snug text-slate-950 hover:underline">
              {p.titulo}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-600">
              {cli}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {pedido ? (
            pedido.modalidad ? (
              <span className={`${baseBadgeClass} font-semibold ${PEDIDO_MODALIDAD_BADGE[pedido.modalidad].cls}`}>
                {PEDIDO_MODALIDAD_BADGE[pedido.modalidad].label}
                {pedido.modalidad === "local" && pedido.mesa ? ` · Mesa ${pedido.mesa}` : ""}
              </span>
            ) : (
              <span className={`${baseBadgeClass} border-[#4FAEB2]/40 bg-[#E5F4F4] font-semibold text-[#3F8E91]`}>
                Pedido
              </span>
            )
          ) : (
            <span className={neutralBadgeClass}>
              {p.proyecto_tipo?.nombre ?? "Tipo"}
            </span>
          )}
          {!pedido && saasModulesLabel ? (
            <span className={neutralBadgeClass}>
              {saasModulesLabel}
            </span>
          ) : null}
          <span className={`${baseBadgeClass} font-semibold ${priorityStyles.badgeClass}`}>
            {prioridadConfig?.nombre ?? prioridadFallbackLabel(p.prioridad)}
          </span>
          {!pedido && (
            <span className={p.sla_estado_actual?.vencido ? `${baseBadgeClass} border-rose-200 bg-rose-50 text-rose-700` : neutralBadgeClass}>
              {slaEstadoLabel(p)}
            </span>
          )}
          {p.bloqueado ? (
            <span className={`${baseBadgeClass} border-rose-200 bg-rose-50 text-rose-800`}>
              Bloqueado
            </span>
          ) : null}
          {moving ? (
            <span className={`${baseBadgeClass} border-sky-200 bg-sky-50 text-sky-800`}>
              Guardando...
            </span>
          ) : null}
        </div>

        {pedido ? (
          <PedidoCardBody
            pedido={pedido}
            total={Number(p.monto_vendido ?? 0)}
            horaIso={p.fecha_ingreso ?? p.last_activity_at ?? null}
            repartidor={p.responsable_tecnico?.nombre ?? null}
          />
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-700">
            <MetaItem label="Com." value={p.responsable_comercial?.nombre ?? "—"} />
            <MetaItem label="Téc." value={p.responsable_tecnico?.nombre ?? "—"} />
            <MetaItem label="Ingreso" value={fmtDate(p.fecha_ingreso)} />
            <MetaItem label="Prometido" value={fmtDate(p.fecha_prometida)} />
            <div className="col-span-2">
              <MetaItem label="Actividad" value={fmtDateTime(p.last_activity_at)} />
            </div>
          </div>
        )}
      </button>
      {!dragOverlay ? (
        <>
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mover a</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              value={p.estado_id}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onMove(p.id, e.target.value)}
            >
              {!estadoActivoIds.has(p.estado_id) ? (
                <option value={p.estado_id}>Estado actual oculto / no usado</option>
              ) : null}
              {estados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="font-semibold text-slate-500">{label}</span>{" "}
      <span className="break-words text-slate-800">{value}</span>
    </div>
  );
}

function PedidoCardBody({
  pedido,
  total,
  horaIso,
  repartidor,
}: {
  pedido: PedidoBrief;
  total: number;
  horaIso: string | null;
  repartidor?: string | null;
}) {
  const maxItems = 4;
  const visibleItems = pedido.items.slice(0, maxItems);
  const extra = Math.max(0, pedido.items.length - maxItems);

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-slate-50/80 px-3 py-2 text-[12px] text-slate-700">
      {/* Detalle entrega — delivery (gastronomía) o pedido de distribuidora (modalidad null) */}
      {(pedido.modalidad === "delivery" || pedido.modalidad === null) &&
      (pedido.cliente_telefono || pedido.direccion_entrega) ? (
        <div className="flex flex-col gap-0.5">
          {pedido.cliente_telefono ? (
            <div className="font-semibold text-slate-800">📞 {pedido.cliente_telefono}</div>
          ) : null}
          {pedido.direccion_entrega ? (
            <div className="text-slate-600">📍 {pedido.direccion_entrega}</div>
          ) : null}
        </div>
      ) : null}
      {pedido.modalidad === "carry_out" && (pedido.cliente_nombre || pedido.cliente_telefono) ? (
        <div className="flex flex-col gap-0.5">
          {pedido.cliente_nombre ? (
            <div className="font-semibold text-slate-800">👤 {pedido.cliente_nombre}</div>
          ) : null}
          {pedido.cliente_telefono ? (
            <div className="text-slate-600">📞 {pedido.cliente_telefono}</div>
          ) : null}
        </div>
      ) : null}

      {/* Productos */}
      {visibleItems.length > 0 ? (
        <ul className="space-y-0.5 border-t border-slate-200 pt-1.5 text-[12px]">
          {visibleItems.map((it, idx) => (
            <li key={idx} className="flex items-baseline gap-1.5 text-slate-800">
              <span className="font-semibold tabular-nums text-slate-900">{it.cantidad}×</span>
              <span className="truncate">{it.producto_nombre}</span>
            </li>
          ))}
          {extra > 0 ? (
            <li className="text-[11px] italic text-slate-500">+{extra} más</li>
          ) : null}
        </ul>
      ) : null}

      {/* Observación */}
      {pedido.observacion ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] italic text-amber-900">
          {pedido.observacion}
        </div>
      ) : null}

      {/* Repartidor asignado */}
      {repartidor ? (
        <div className="flex items-center gap-1 border-t border-slate-200 pt-1.5 text-[11px] text-slate-600">
          <span aria-hidden>🚚</span>
          <span className="truncate font-medium text-slate-800">{repartidor}</span>
        </div>
      ) : null}

      {/* Footer total + hora */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
        <span className="text-[11px] text-slate-500">{fmtPedidoHora(horaIso)}</span>
        <span className="text-[13px] font-bold tabular-nums text-[#3F8E91]">
          {fmtPedidoTotal(total)}
        </span>
      </div>
    </div>
  );
}

function EstadoMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="min-w-[120px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
      <div className="mb-1 h-0.5 rounded-full" style={{ backgroundColor: color || "#94a3b8" }} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500" title={label}>
          {label}
        </span>
        <span className="text-base font-semibold text-slate-900 tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : "—";
}

function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}
