"use client";

import { useEffect, useState } from "react";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { FancySelect } from "@/components/ui/FancySelect";
import MobileFab from "@/components/ui/MobileFab";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { getVentas } from "@/lib/ventas/storage";
import type { Venta, TipoVenta, TipoIvaVenta } from "@/lib/ventas/types";
import ImputarObraSelect from "@/components/proyectos/ImputarObraSelect";
import PresupuestoActions from "@/components/ventas/PresupuestoActions";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGs(valor: number) {
  return `€ ${valor.toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatFecha(iso: string) {
  try {
    const d    = new Date(iso);
    const dd   = String(d.getDate()).padStart(2, "0");
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2, "0");
    const min  = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

// ── Constantes de estilo ───────────────────────────────────────────────────────

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";


const ivaLabel: Record<TipoIvaVenta, string> = {
  EXENTA: "Exento",
  "4%":   "IVA 4%",
  "5%":   "IVA 5%",
  "10%":  "IVA 10%",
  "21%":  "IVA 21%",
};

// ── Métricas del día ──────────────────────────────────────────────────────────

function esDeHoy(iso: string): boolean {
  try {
    const fecha = new Date(iso);
    const hoy   = new Date();
    return (
      fecha.getFullYear() === hoy.getFullYear() &&
      fecha.getMonth()    === hoy.getMonth()    &&
      fecha.getDate()     === hoy.getDate()
    );
  } catch {
    return false;
  }
}

interface MetricasHoy {
  facturacion:       number;
  cantidadVentas:    number;
  ticketPromedio:    number;
  productosVendidos: number;  // suma de todas las cantidades en todos los ítems
}

function calcularMetricas(ventas: Venta[]): MetricasHoy {
  const deHoy            = ventas.filter((v) => esDeHoy(v.fecha));
  const facturacion      = deHoy.reduce((s, v) => s + v.total, 0);
  const cantidadVentas   = deHoy.length;
  const ticketPromedio   = cantidadVentas > 0 ? facturacion / cantidadVentas : 0;
  const productosVendidos = deHoy.reduce(
    (s, v) => s + v.items.reduce((si, i) => si + i.cantidad, 0),
    0
  );
  return { facturacion, cantidadVentas, ticketPromedio, productosVendidos };
}

// ── Tarjeta métrica ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border px-5 py-4 flex flex-col gap-1 shadow-sm ${
      accent
        ? "bg-[#4FAEB2] border-[#4FAEB2] ring-1 ring-[#4FAEB2]/25"
        : "bg-white border-[#4FAEB2]/30 ring-1 ring-[#4FAEB2]/10"
    }`}>
      <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
        accent ? "text-white/90" : "text-[#4FAEB2]"
      }`}>
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums leading-tight ${
        accent ? "text-white" : "text-[#3F8E91]"
      }`}>
        {value}
      </span>
      {sub && <span className={`text-xs ${accent ? "text-white/80" : "text-slate-500"}`}>{sub}</span>}
    </div>
  );
}

// ── Helpers de fila ───────────────────────────────────────────────────────────

/** Muestra el primer producto de la venta y un badge con el resto. */
function ResumenProductos({ v }: { v: Venta }) {
  const primero = v.items[0];
  if (!primero) {
    return (
      <span className="text-xs text-gray-400">Sin líneas cargadas</span>
    );
  }
  const extra   = v.items.length - 1;
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

/** Determina qué mostrar en la celda IVA cuando hay múltiples ítems. */
function ivaResumen(v: Venta): string {
  const tipos = [...new Set(v.items.map((i) => i.tipo_iva))];
  if (tipos.length === 1) return ivaLabel[tipos[0]];
  return "Mixto";
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function VentasPage() {
  const [todas,      setTodas]      = useState<Venta[]>([]);
  const [busqueda,   setBusqueda]   = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoVenta | "">("");
  const [filtroIva,  setFiltroIva]  = useState<TipoIvaVenta | "">("");

  useEffect(() => {
    let cancelled = false;
    getVentas().then((data) => {
      if (cancelled) return;
      // /ventas SOLO lista ventas reales. Los presupuestos viven en /presupuestos
      // mientras están pendientes/rechazados. Solo aparecen acá una vez que se
      // aprueban (en cuyo momento pasan a ser obra) o se rechazan, para no
      // mezclar cotizaciones con ingresos reales.
      const soloVentasRealesYAprobados = data.filter((v) => {
        const tipoDoc = v.tipo_documento ?? "venta";
        if (tipoDoc !== "presupuesto") return true;
        const estadoP = v.estado_presupuesto ?? "pendiente";
        return estadoP === "aprobado" || estadoP === "convertido";
      });
      const ordenadas = soloVentasRealesYAprobados.sort((a, b) => {
        const ta = new Date(a.fecha).getTime();
        const tb = new Date(b.fecha).getTime();
        return tb - ta || b.numero_control.localeCompare(a.numero_control);
      });
      setTodas(ordenadas);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const metricas = calcularMetricas(todas);

  const filtradas = todas.filter((v) => {
    // Búsqueda global: número de control, nombre o SKU de cualquier ítem
    if (busqueda.trim() !== "") {
      const t = busqueda.toLowerCase().trim();
      const coincide =
        v.numero_control.toLowerCase().includes(t) ||
        v.items.some(
          (i) =>
            i.producto_nombre.toLowerCase().includes(t) ||
            i.sku.toLowerCase().includes(t)
        );
      if (!coincide) return false;
    }
    // Tipo de venta
    if (filtroTipo !== "" && v.tipo_venta !== filtroTipo) return false;
    // IVA: coincide si al menos un ítem tiene ese tipo
    if (filtroIva !== "" && !v.items.some((i) => i.tipo_iva === filtroIva))
      return false;
    return true;
  });

  const hayFiltros = busqueda || filtroTipo || filtroIva;

  return (
    <div className="space-y-8">

      <PageHeader
        eyebrow="NCG · Operaciones"
        title="Ventas"
        description="Ventas directas de materiales y ventas de obra (descuenta stock y crea la obra automáticamente)"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button href="/ventas/nueva?tipo=obra" size="sm" variant="secondary">
              <span aria-hidden>+</span> Nueva venta de obra
            </Button>
            <Button href="/ventas/nueva" size="sm">
              <span aria-hidden>+</span> Nueva venta de material
            </Button>
          </div>
        }
      />

      {/* ── Métricas del día ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">
          Resumen de hoy —{" "}
          {new Date().toLocaleDateString("es-PY", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Facturación de hoy"
            value={`€ ${metricas.facturacion.toLocaleString("es-PY")}`}
            sub="Total incl. IVA"
            accent
          />
          <MetricCard
            label="Ventas de hoy"
            value={String(metricas.cantidadVentas)}
            sub={metricas.cantidadVentas === 1 ? "orden registrada" : "órdenes registradas"}
          />
          <MetricCard
            label="Ticket promedio"
            value={
              metricas.ticketPromedio > 0
                ? `€ ${metricas.ticketPromedio.toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                : "—"
            }
            sub="Por orden de venta"
          />
          <MetricCard
            label="Unidades vendidas"
            value={String(metricas.productosVendidos)}
            sub="Unidades despachadas"
          />
        </div>
      </div>

      {/* ── Tabla de ventas ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm ring-1 ring-[#4FAEB2]/15 p-6">

        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-800">Órdenes de venta</h2>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-gray-100">
          <input
            type="text"
            placeholder="Buscar por número, producto o SKU..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-64`}
          />
          <FancySelect
            value={filtroTipo}
            onChange={(v) => setFiltroTipo(v as TipoVenta | "")}
            ariaLabel="Filtrar por tipo de venta"
            className="w-44"
            size="sm"
            options={[
              { value: "", label: "Todos los tipos" },
              { value: "CONTADO", label: "Contado" },
              { value: "CREDITO", label: "Crédito" },
            ]}
          />
          <FancySelect
            value={filtroIva}
            onChange={(v) => setFiltroIva(v as TipoIvaVenta | "")}
            ariaLabel="Filtrar por IVA"
            className="w-44"
            size="sm"
            options={[
              { value: "", label: "Todos los IVA" },
              { value: "EXENTA", label: "Exenta" },
              { value: "5%", label: "IVA 5%" },
              { value: "10%", label: "IVA 10%" },
            ]}
          />
          {hayFiltros && (
            <button
              onClick={() => { setBusqueda(""); setFiltroTipo(""); setFiltroIva(""); }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
            >
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400">
            {filtradas.length} de {todas.length} ventas
          </span>
        </div>

        {/* Tabla — min-w fuerza scroll horizontal en mobile; columnas secundarias
            (Items, Cant total, IVA, Pago) se ocultan progresivamente. */}
        <EdgeScrollArea>
          <table className="w-full min-w-[1000px] lg:min-w-0 text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Número</th>
                <th className="py-3 pr-4 font-medium">Doc.</th>
                <th className="py-3 pr-4 font-medium">Productos</th>
                <th className="py-3 pr-4 font-medium text-center hidden md:table-cell">Ítems</th>
                <th className="py-3 pr-4 font-medium text-right hidden lg:table-cell">Cant. total</th>
                <th className="py-3 pr-4 font-medium hidden lg:table-cell">IVA</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="py-3 pr-4 font-medium hidden md:table-cell">Tipo</th>
                <th className="py-3 pr-4 font-medium hidden md:table-cell">Pago</th>
                <th className="py-3 pr-4 font-medium">Fecha</th>
                <th className="py-3 pr-4 font-medium hidden lg:table-cell">Obra</th>
                <th className="py-3 font-medium text-center">Ticket</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-400">
                    {todas.length === 0
                      ? "No hay ventas registradas"
                      : "Ninguna venta coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtradas.map((v) => {
                  const cantTotal = v.items.reduce((s, i) => s + i.cantidad, 0);
                  return (
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
                        <ResumenProductos v={v} />
                      </td>
                      <td className="py-4 pr-4 text-center align-middle hidden md:table-cell">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                          {v.items.length}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-right tabular-nums text-gray-700 align-middle hidden lg:table-cell">
                        {cantTotal}
                      </td>
                      <td className="py-4 pr-4 align-middle hidden lg:table-cell">
                        <Badge tone="primary">{ivaResumen(v)}</Badge>
                      </td>
                      <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800 align-middle">
                        {formatGs(v.total)}
                      </td>
                      <td className="py-4 pr-4 align-middle hidden md:table-cell">
                        <Badge tone={v.tipo_venta === "CONTADO" ? "neutral" : "warning"}>
                          {v.tipo_venta === "CONTADO"
                            ? "Contado"
                            : `Crédito ${v.plazo_dias ?? ""}d`}
                        </Badge>
                      </td>
                      <td className="py-4 pr-4 align-middle text-xs text-gray-600 hidden md:table-cell">
                        {v.metodo_pago === "tarjeta" ? "Tarjeta"
                          : v.metodo_pago === "transferencia" ? "Transfer."
                          : v.metodo_pago === "efectivo" ? "Efectivo"
                          : "—"}
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
                        <a
                          href={`/api/ventas/${v.id}/ticket?mode=comandas`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                          title="Abrir comandas + ticket cliente"
                        >
                          Imprimir
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </EdgeScrollArea>

      </div>

      {/* FAB mobile: acceso 1-tap a "+ Nueva venta" desde cualquier scroll position */}
      <MobileFab href="/ventas/nueva" label="Nueva venta" />
    </div>
  );
}
