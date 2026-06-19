"use client";

/**
 * Módulo dedicado de Presupuestos de obra.
 *
 * No duplica datos: lista la misma tabla `ventas` pero filtrada por
 * tipo_documento='presupuesto'. El formulario de alta es el mismo que el de
 * Ventas (/ventas/nueva?tipo=presupuesto), porque internamente sigue siendo
 * una venta con tipo_documento='presupuesto'.
 */

import { useEffect, useState } from "react";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { FancySelect } from "@/components/ui/FancySelect";
import MobileFab from "@/components/ui/MobileFab";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { getVentas } from "@/lib/ventas/storage";
import type { Venta } from "@/lib/ventas/types";
import ImputarObraSelect from "@/components/proyectos/ImputarObraSelect";
import PresupuestoActions from "@/components/ventas/PresupuestoActions";

type EstadoPres = "pendiente" | "aprobado" | "rechazado" | "convertido";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";

function formatEur(valor: number) {
  return `€ ${valor.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return iso;
  }
}

function ResumenPartidas({ v }: { v: Venta }) {
  const primero = v.items[0];
  if (!primero) {
    return <span className="text-xs text-gray-400">Sin partidas</span>;
  }
  const extra = v.items.length - 1;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-gray-800 leading-tight">
        {primero.producto_nombre}
      </span>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="font-mono text-xs text-gray-400">{primero.sku}</span>
        {extra > 0 && (
          <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full font-medium">
            +{extra} más
          </span>
        )}
      </div>
    </div>
  );
}

export default function PresupuestosPage() {
  const [todas, setTodas] = useState<Venta[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoPres | "">("");

  useEffect(() => {
    let cancelled = false;
    getVentas().then((data) => {
      if (cancelled) return;
      const soloPresupuestos = data.filter((v) => (v.tipo_documento ?? "venta") === "presupuesto");
      const ordenadas = [...soloPresupuestos].sort((a, b) => {
        const ta = new Date(a.fecha).getTime();
        const tb = new Date(b.fecha).getTime();
        return tb - ta || b.numero_control.localeCompare(a.numero_control);
      });
      setTodas(ordenadas);
    });
    return () => { cancelled = true; };
  }, []);

  const filtradas = todas.filter((v) => {
    if (busqueda.trim() !== "") {
      const t = busqueda.toLowerCase().trim();
      const coincide =
        v.numero_control.toLowerCase().includes(t) ||
        v.items.some((i) =>
          i.producto_nombre.toLowerCase().includes(t) ||
          i.sku.toLowerCase().includes(t)
        );
      if (!coincide) return false;
    }
    if (filtroEstado !== "" && (v.estado_presupuesto ?? "pendiente") !== filtroEstado) return false;
    return true;
  });

  // KPIs sencillos
  const totalEnPendientes = todas
    .filter((v) => (v.estado_presupuesto ?? "pendiente") === "pendiente")
    .reduce((s, v) => s + v.total, 0);
  const cantAprobados = todas.filter((v) => v.estado_presupuesto === "aprobado").length;
  const cantConvertidos = todas.filter((v) => v.estado_presupuesto === "convertido").length;
  const cantPendientes = todas.filter((v) => (v.estado_presupuesto ?? "pendiente") === "pendiente").length;

  const hayFiltros = busqueda || filtroEstado;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="NCG · Comercial"
        title="Presupuestos de obra"
        description="Cotizaciones para cubiertas, retejados e impermeabilizaciones. Al aprobar y convertir, se crea la obra automáticamente."
        actions={
          <Button href="/ventas/nueva?tipo=presupuesto" size="sm">
            <span aria-hidden>+</span> Nuevo presupuesto
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total" value={String(todas.length)} hint="presupuestos registrados" />
        <KpiCard label="Pendientes" value={String(cantPendientes)} hint={formatEur(totalEnPendientes)} />
        <KpiCard label="Aprobados" value={String(cantAprobados)} hint="listos para convertir en obra" />
        <KpiCard label="Convertidos" value={String(cantConvertidos)} hint="ya son obra" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm ring-1 ring-[#4FAEB2]/15 p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-800">Listado</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-gray-100">
          <input
            type="text"
            placeholder="Buscar por número, partida o SKU…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-64`}
          />
          <FancySelect
            value={filtroEstado}
            onChange={(v) => setFiltroEstado(v as EstadoPres | "")}
            ariaLabel="Filtrar por estado"
            className="w-44"
            size="sm"
            options={[
              { value: "", label: "Todos los estados" },
              { value: "pendiente", label: "Pendiente" },
              { value: "aprobado", label: "Aprobado" },
              { value: "rechazado", label: "Rechazado" },
              { value: "convertido", label: "Convertido" },
            ]}
          />
          {hayFiltros && (
            <button
              onClick={() => { setBusqueda(""); setFiltroEstado(""); }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
            >
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400">
            {filtradas.length} de {todas.length} presupuestos
          </span>
        </div>

        <EdgeScrollArea>
          <table className="w-full min-w-[900px] lg:min-w-0 text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Número</th>
                <th className="py-3 pr-4 font-medium">Estado / acciones</th>
                <th className="py-3 pr-4 font-medium">Partidas</th>
                <th className="py-3 pr-4 font-medium text-center hidden md:table-cell">Ítems</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="py-3 pr-4 font-medium">Fecha</th>
                <th className="py-3 pr-4 font-medium hidden lg:table-cell">Obra vinculada</th>
                <th className="py-3 font-medium text-center">PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    {todas.length === 0
                      ? "No hay presupuestos. Creá uno con \"+ Nuevo presupuesto\"."
                      : "Ningún presupuesto coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtradas.map((v) => (
                  <tr key={v.id} className="border-b border-slate-200 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="py-4 pr-4 font-mono text-xs text-gray-500 align-middle">
                      {v.numero_control}
                    </td>
                    <td className="py-4 pr-4 align-middle">
                      <PresupuestoActions
                        id={v.id}
                        tipo={v.tipo_documento ?? "venta"}
                        estado={v.estado_presupuesto ?? null}
                        proyectoId={v.proyecto_id ?? null}
                      />
                    </td>
                    <td className="py-4 pr-4 align-middle">
                      <ResumenPartidas v={v} />
                    </td>
                    <td className="py-4 pr-4 text-center align-middle hidden md:table-cell">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                        {v.items.length}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800 align-middle">
                      {formatEur(v.total)}
                    </td>
                    <td className="py-4 pr-4 text-gray-500 text-xs tabular-nums align-middle">
                      {formatFecha(v.fecha)}
                    </td>
                    <td className="py-4 pr-4 align-middle hidden lg:table-cell">
                      <ImputarObraSelect
                        tabla="ventas"
                        id={v.id}
                        proyectoIdInicial={v.proyecto_id ?? null}
                      />
                    </td>
                    <td className="py-4 text-center align-middle">
                      <ImprimirIdiomaMenu ventaId={v.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </EdgeScrollArea>
      </div>

      <MobileFab href="/ventas/nueva?tipo=presupuesto" label="Nuevo presupuesto" />
    </div>
  );
}

const IDIOMAS_PDF: Array<{ code: "es" | "en" | "fr" | "it"; label: string }> = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
];

function ImprimirIdiomaMenu({ ventaId }: { ventaId: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        title="Imprimir PDF del presupuesto"
      >
        Imprimir
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black/5">
          {IDIOMAS_PDF.map((i) => (
            <a
              key={i.code}
              href={`/api/ventas/${ventaId}/ticket?lang=${i.code}`}
              target="_blank"
              rel="noopener"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 first:rounded-t-md last:rounded-b-md"
            >
              {i.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-800 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
