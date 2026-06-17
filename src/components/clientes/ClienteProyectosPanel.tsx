"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type ProyectoItem = {
  id: string;
  titulo: string;
  prioridad?: string;
  archivado?: boolean;
  bloqueado?: boolean;
  fecha_ingreso?: string | null;
  fecha_prometida?: string | null;
  monto_vendido?: number | null;
  last_activity_at?: string | null;
  proyecto_tipo?: { nombre?: string | null; codigo?: string | null } | null;
  proyecto_estado?: {
    nombre?: string | null;
    color?: string | null;
    es_estado_final?: boolean | null;
  } | null;
  responsable_comercial?: { nombre?: string | null } | null;
  responsable_tecnico?: { nombre?: string | null } | null;
  sla_estado_actual?: {
    vencido?: boolean;
  } | null;
};

type ApiResponse =
  | { success: true; data: ProyectoItem[] }
  | { success: false; error: string };

function formatFecha(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

function formatMonto(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Number(n));
  } catch {
    return String(n);
  }
}

const PRIORIDAD_BADGE: Record<string, string> = {
  baja: "bg-slate-100 text-slate-600",
  normal: "bg-sky-50 text-sky-700",
  alta: "bg-amber-50 text-amber-700",
  urgente: "bg-rose-50 text-rose-700",
};

export default function ClienteProyectosPanel({ clienteId }: { clienteId: string }) {
  const [items, setItems] = useState<ProyectoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos?cliente_id=${encodeURIComponent(clienteId)}&archivado=all`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.success) {
        setItems([]);
        setError(json.success === false ? json.error : "No se pudieron cargar los proyectos");
        return;
      }
      setItems(json.data ?? []);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Error al cargar proyectos");
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    if (!clienteId) return;
    void cargar();
  }, [clienteId, cargar]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
        <button
          type="button"
          onClick={() => void cargar()}
          className="ml-3 underline hover:no-underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-5xl mb-4">📁</span>
        <h3 className="text-base font-semibold text-gray-600 mb-2">Sin proyectos asociados</h3>
        <p className="text-sm text-gray-400 max-w-xs mb-5">
          Este cliente todavía no tiene proyectos. Creá uno desde el módulo de proyectos.
        </p>
        <Link
          href={`/dashboard/proyectos/nuevo?cliente_id=${encodeURIComponent(clienteId)}`}
          className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          Nuevo proyecto
        </Link>
      </div>
    );
  }

  const activos = items.filter((p) => !p.archivado);
  const archivados = items.filter((p) => p.archivado);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {items.length} proyecto{items.length === 1 ? "" : "s"} asociado{items.length === 1 ? "" : "s"}
        </p>
        <Link
          href={`/dashboard/proyectos/nuevo?cliente_id=${encodeURIComponent(clienteId)}`}
          className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm"
        >
          + Nuevo proyecto
        </Link>
      </div>

      <ProyectoLista titulo="En curso" items={activos} />
      {archivados.length > 0 && (
        <ProyectoLista titulo="Archivados" items={archivados} dim />
      )}
    </div>
  );
}

function ProyectoLista({
  titulo,
  items,
  dim = false,
}: {
  titulo: string;
  items: ProyectoItem[];
  dim?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{titulo}</p>
      <div className="space-y-2">
        {items.map((p) => (
          <ProyectoCard key={p.id} p={p} dim={dim} />
        ))}
      </div>
    </div>
  );
}

function ProyectoCard({ p, dim }: { p: ProyectoItem; dim?: boolean }) {
  const estadoColor = p.proyecto_estado?.color || "#64748b";
  const prioridadKey = (p.prioridad ?? "normal").toLowerCase();
  const prioridadClass = PRIORIDAD_BADGE[prioridadKey] ?? PRIORIDAD_BADGE.normal;
  const monto = formatMonto(p.monto_vendido);
  const slaVencido = p.sla_estado_actual?.vencido === true;
  return (
    <Link
      href={`/dashboard/proyectos/${p.id}`}
      className={`block border border-slate-200 rounded-xl px-4 py-3 hover:border-sky-300 hover:bg-sky-50/30 transition-colors ${
        dim ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${estadoColor}1a`,
                color: estadoColor,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: estadoColor }} />
              {p.proyecto_estado?.nombre ?? "Sin estado"}
            </span>
            {p.proyecto_tipo?.nombre && (
              <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {p.proyecto_tipo.nombre}
              </span>
            )}
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${prioridadClass}`}>
              {prioridadKey}
            </span>
            {p.bloqueado && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                bloqueado
              </span>
            )}
            {slaVencido && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                SLA vencido
              </span>
            )}
          </div>
          <h4 className="mt-1.5 text-sm font-semibold text-slate-800 truncate">{p.titulo}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Ingreso: {formatFecha(p.fecha_ingreso)}</span>
            {p.fecha_prometida && <span>Promesa: {formatFecha(p.fecha_prometida)}</span>}
            {p.responsable_comercial?.nombre && (
              <span>Comercial: {p.responsable_comercial.nombre}</span>
            )}
            {p.responsable_tecnico?.nombre && (
              <span>Técnico: {p.responsable_tecnico.nombre}</span>
            )}
          </div>
        </div>
        {monto && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Monto</div>
            <div className="text-sm font-semibold text-slate-700">₲ {monto}</div>
          </div>
        )}
      </div>
    </Link>
  );
}
