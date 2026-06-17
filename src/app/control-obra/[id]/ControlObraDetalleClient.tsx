"use client";

/**
 * Detalle de Control de obra.
 *
 * Tabs operativos/financieros separados del módulo Proyectos:
 * resumen financiero, materiales, compras, gastos, mano de obra, rentabilidad
 * y trazabilidad. Reutiliza RentabilidadObra, MaterialesObra y PersonalObra.
 *
 * Compras/Gastos: GET /api/compras y /api/gastos filtran client-side por
 * proyecto_id (los endpoints actuales devuelven todo el tenant).
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import RentabilidadObra from "@/app/dashboard/proyectos/components/RentabilidadObra";
import MaterialesObra from "@/app/dashboard/proyectos/components/MaterialesObra";
import PersonalObra from "@/app/dashboard/proyectos/components/PersonalObra";

type Proyecto = {
  id: string;
  titulo?: string;
  cliente?: { empresa?: string | null; nombre_contacto?: string | null } | null;
  estado?: { nombre?: string } | null;
};

type Compra = {
  id: string;
  proyecto_id?: string | null;
  fecha?: string | null;
  numero_documento?: string | null;
  proveedor_nombre?: string | null;
  proveedor?: { nombre?: string | null } | null;
  total?: number | null;
  estado?: string | null;
  observacion?: string | null;
};

type Gasto = {
  id: string;
  proyecto_id?: string | null;
  fecha?: string | null;
  concepto?: string | null;
  categoria?: string | null;
  monto?: number | null;
  responsable?: string | null;
  observacion?: string | null;
};

const TABS = [
  { id: "rentabilidad", label: "Rentabilidad" },
  { id: "materiales", label: "Materiales" },
  { id: "compras", label: "Compras" },
  { id: "gastos", label: "Gastos" },
  { id: "mano_obra", label: "Mano de obra" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const fmtEur = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `€ ${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-ES");
  } catch {
    return iso;
  }
}

function clienteNombre(p: Proyecto): string {
  const c = p.cliente;
  if (!c) return "—";
  const a = (c.empresa ?? "").trim();
  const b = (c.nombre_contacto ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "—";
}

function readTabFromHash(): TabId {
  if (typeof window === "undefined") return "rentabilidad";
  const h = (window.location.hash || "").replace(/^#/, "");
  return (TABS.find((t) => t.id === h)?.id ?? "rentabilidad") as TabId;
}

export default function ControlObraDetalleClient({ projectId }: { projectId: string }) {
  // El tab inicial puede venir en el hash (ej: /control-obra/abc#materiales)
  // para permitir deep-linking desde otros módulos. Se actualiza con hashchange
  // por si el usuario edita la URL o el navegador navega entre anchors.
  const [tab, setTab] = useState<TabId>("rentabilidad");
  useEffect(() => {
    setTab(readTabFromHash());
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const handleSetTab = (id: TabId) => {
    setTab(id);
    if (typeof window !== "undefined") {
      // replaceState evita meter una entrada nueva en el historial por cada click.
      window.history.replaceState(null, "", `#${id}`);
    }
  };
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession(`/api/proyectos/${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (j: { success?: boolean; data?: { proyecto?: Proyecto }; error?: string }) => {
          if (j?.success && j.data?.proyecto) setProyecto(j.data.proyecto);
          else setErr(j?.error ?? "No se pudo cargar la obra");
        }
      )
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [projectId]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/control-obra"
          className="text-sm text-[#3F8E91] hover:text-[#4FAEB2] hover:underline"
        >
          ← Selector de obras
        </Link>
        <Link
          href={`/dashboard/proyectos/${projectId}`}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a obra
        </Link>
      </div>

      <div className="border-b border-slate-200 pb-4">
        <h1 className="truncate text-xl font-semibold text-slate-900">
          {proyecto?.titulo || "Control de obra"}
        </h1>
        <p className="text-sm text-slate-500">
          {proyecto ? `${clienteNombre(proyecto)} · ${proyecto.estado?.nombre ?? "—"}` : "Cargando…"}
        </p>
      </div>

      {err ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {err}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleSetTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border border-[#4FAEB2]/40 bg-[#E5F4F4] text-[#3F8E91]"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "rentabilidad" ? <RentabilidadObra projectId={projectId} /> : null}
      {tab === "materiales" ? <MaterialesObra projectId={projectId} /> : null}
      {tab === "compras" ? <ComprasTab projectId={projectId} /> : null}
      {tab === "gastos" ? <GastosTab projectId={projectId} /> : null}
      {tab === "mano_obra" ? <PersonalObra projectId={projectId} /> : null}
    </div>
  );
}

function ComprasTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession("/api/compras", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (j: {
          success?: boolean;
          data?: { compras?: Compra[] } | Compra[];
          error?: string;
        }) => {
          if (j?.success && j.data) {
            const arr = Array.isArray(j.data) ? j.data : j.data.compras ?? [];
            setRows(arr.filter((c) => c.proyecto_id === projectId));
          } else setErr(j?.error ?? "No se pudo cargar compras");
        }
      )
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const total = useMemo(() => rows.reduce((s, c) => s + Number(c.total ?? 0), 0), [rows]);

  if (loading) return <div className="text-sm text-slate-500">Cargando compras…</div>;
  if (err)
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {err}
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href={`/compras/nueva?proyecto_id=${encodeURIComponent(projectId)}&return_to=${encodeURIComponent(`/control-obra/${projectId}#compras`)}`}
          className="inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3F8E91]"
        >
          + Nueva compra para esta obra
        </Link>
      </div>

      {rows.length === 0 ? (
        <VacioControl
          tipo="compras"
          accion={`/compras/nueva?proyecto_id=${encodeURIComponent(projectId)}&return_to=${encodeURIComponent(`/control-obra/${projectId}#compras`)}`}
          accionLabel="+ Nueva compra"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="text-slate-700">
                  <td className="px-4 py-2.5 tabular-nums">{fmtFecha(c.fecha)}</td>
                  <td className="px-4 py-2.5">
                    {c.proveedor_nombre ?? c.proveedor?.nombre ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">{c.numero_documento ?? "—"}</td>
                  <td className="px-4 py-2.5">{c.estado ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(c.total ?? 0)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/compras/${c.id}`}
                      className="text-xs font-medium text-[#3F8E91] hover:underline"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 text-sm">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 font-semibold text-slate-700">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                  {fmtEur(total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function GastosTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession("/api/gastos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Gasto[]; error?: string }) => {
        if (j?.success) {
          const arr = Array.isArray(j.data) ? j.data : [];
          setRows(arr.filter((g) => g.proyecto_id === projectId));
        } else setErr(j?.error ?? "No se pudo cargar gastos");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const total = useMemo(() => rows.reduce((s, g) => s + Number(g.monto ?? 0), 0), [rows]);

  if (loading) return <div className="text-sm text-slate-500">Cargando gastos…</div>;
  if (err)
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {err}
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href={`/gastos/nuevo?proyecto_id=${encodeURIComponent(projectId)}&return_to=${encodeURIComponent(`/control-obra/${projectId}#gastos`)}`}
          className="inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3F8E91]"
        >
          + Nuevo gasto para esta obra
        </Link>
      </div>

      {rows.length === 0 ? (
        <VacioControl
          tipo="gastos"
          accion={`/gastos/nuevo?proyecto_id=${encodeURIComponent(projectId)}&return_to=${encodeURIComponent(`/control-obra/${projectId}#gastos`)}`}
          accionLabel="+ Nuevo gasto"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((g) => (
                <tr key={g.id} className="text-slate-700">
                  <td className="px-4 py-2.5 tabular-nums">{fmtFecha(g.fecha)}</td>
                  <td className="px-4 py-2.5">{g.concepto ?? "—"}</td>
                  <td className="px-4 py-2.5">{g.categoria ?? "—"}</td>
                  <td className="px-4 py-2.5">{g.responsable ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(g.monto ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 text-sm">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 font-semibold text-slate-700">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                  {fmtEur(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function VacioControl({
  tipo,
  accion,
  accionLabel,
}: {
  tipo: "compras" | "gastos";
  accion?: string;
  accionLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
      <p className="font-medium text-slate-800">
        Todavía no hay {tipo} imputados a esta obra.
      </p>
      {accion ? (
        <Link
          href={accion}
          className="mt-3 inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3F8E91]"
        >
          {accionLabel ?? "Registrar"}
        </Link>
      ) : null}
    </div>
  );
}
