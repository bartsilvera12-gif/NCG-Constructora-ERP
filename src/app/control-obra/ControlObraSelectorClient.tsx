"use client";

/**
 * Selector de obras para Control de obra.
 *
 * Lista las obras (proyectos cuyo tipo es Obra NCG) con buscador y filtro de
 * estado. Click → /control-obra/[id]. Reusa /api/proyectos.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HardHat, Search } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { isObraConstructora } from "@/lib/proyectos/brief-data";

type Estado = { id: string; nombre: string };

type Proyecto = {
  id: string;
  titulo?: string;
  estado_id?: string;
  proyecto_tipo?: { codigo?: string; nombre?: string } | null;
  estado?: { nombre?: string } | null;
  cliente?: { empresa?: string | null; nombre_contacto?: string | null } | null;
  fecha_prometida?: string | null;
  monto_vendido?: number | null;
};

function clienteNombre(p: Proyecto): string {
  const c = p.cliente;
  if (!c) return "—";
  const a = (c.empresa ?? "").trim();
  const b = (c.nombre_contacto ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "—";
}

const fmtEur = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `€ ${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function ControlObraSelectorClient() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [q, setQ] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (estadoId) params.set("estado_id", estadoId);
      const [rP, rE] = await Promise.all([
        fetchWithSupabaseSession(`/api/proyectos?${params.toString()}`, { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
      ]);
      const jP = (await rP.json()) as { success?: boolean; data?: Proyecto[]; error?: string };
      const jE = (await rE.json()) as { success?: boolean; data?: Estado[] };
      if (cancelled) return;
      if (!rP.ok || !jP.success) {
        setErr(jP.error ?? "Error al cargar obras");
      } else {
        setErr(null);
        setProyectos(jP.data ?? []);
      }
      if (jE.success && jE.data) setEstados(jE.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [q, estadoId]);

  const obras = useMemo(
    () =>
      proyectos.filter((p) =>
        isObraConstructora({ codigo: p.proyecto_tipo?.codigo, nombre: p.proyecto_tipo?.nombre })
      ),
    [proyectos]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <HardHat className="h-5 w-5 text-[#4FAEB2]" /> Control de obra
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Costos, materiales, mano de obra y rentabilidad por obra.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título o cliente…"
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-[#4FAEB2] focus:outline-none focus:ring-1 focus:ring-[#4FAEB2]"
          />
        </div>
        <select
          value={estadoId}
          onChange={(e) => setEstadoId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          <option value="">Todos los estados</option>
          {estados.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>

      {err ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {err}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando obras…</div>
        ) : obras.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No se encontraron obras con los filtros actuales.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Obra</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Presupuestado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {obras.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{o.titulo || "Obra sin título"}</div>
                    <div className="text-xs text-slate-400">
                      {o.proyecto_tipo?.nombre ?? "Obra"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{clienteNombre(o)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{o.estado?.nombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {fmtEur(o.monto_vendido ?? null)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/control-obra/${o.id}`}
                      className="inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3F8E91]"
                    >
                      Abrir control →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
