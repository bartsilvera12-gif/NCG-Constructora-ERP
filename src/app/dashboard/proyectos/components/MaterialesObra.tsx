"use client";

/**
 * Pestaña "Materiales" del detalle de obra.
 *
 * Estimados (snapshot del presupuesto guardado en brief_data) vs usados
 * reales (movimientos_inventario SALIDA imputados a esta obra).
 *
 * Endpoint: GET /api/proyectos/[id]/materiales
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const fmtEur = (n: number) =>
  `€ ${Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Combinado = {
  key: string;
  producto_id: string | null;
  producto_nombre: string;
  sku: string;
  est_cantidad: number;
  usado_cantidad: number;
  diferencia: number;
  est_total: number;
  usado_total: number;
};

type UsadoDetalle = {
  producto_id: string | null;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  fecha: string;
  motivo: string | null;
  observacion: string | null;
  usuario_nombre: string | null;
};

type Resp = {
  combinado: Combinado[];
  usados: UsadoDetalle[];
  totales: { estimado_total: number; usado_total: number };
};

const MOTIVO_LABEL: Record<string, string> = {
  uso_obra: "Uso en obra",
  consumo_interno: "Consumo interno",
  rotura: "Rotura / pérdida",
  ajuste: "Ajuste",
  entrega_cuadrilla: "Entrega a cuadrilla",
  transferencia_vehiculo: "Transferencia a vehículo",
};

function fmtFecha(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function MaterialesObra({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession(`/api/proyectos/${projectId}/materiales`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Resp; error?: string }) => {
        if (j?.success && j.data) setData(j.data);
        else setErr(j?.error ?? "No se pudo cargar materiales");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="text-sm text-slate-500">Cargando materiales…</div>;
  if (err) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>;
  if (!data) return null;

  const filas = data.combinado;
  const usados = data.usados ?? [];
  const hayEstimados = filas.some((f) => f.est_cantidad > 0);
  const sinDatos = filas.length === 0 && usados.length === 0;

  const totalUnidades = usados.reduce((s, u) => s + u.cantidad, 0);
  const totalCosto = data.totales.usado_total;
  const ultimaSalida = usados.length > 0 ? usados[0].fecha : null;

  const nuevaSalidaHref = `/inventario/movimientos/nuevo?tipo=SALIDA&proyecto_id=${encodeURIComponent(projectId)}`;
  const verMovimientosHref = `/inventario/movimientos?proyecto_id=${encodeURIComponent(projectId)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 flex-1 min-w-[260px]">
          Comparativa de <strong>materiales estimados</strong> (presupuesto) vs <strong>materiales usados</strong>
          (salidas reales de inventario imputadas a esta obra). Los estimados no descuentan stock; solo los usados sí.
        </div>
        <div className="flex gap-2">
          <Link href={verMovimientosHref} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Ver en Movimientos
          </Link>
          <Link href={nuevaSalidaHref} className="inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3F8E91]">
            + Registrar salida de material
          </Link>
        </div>
      </div>

      {sinDatos ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-800">Todavía no hay materiales imputados a esta obra.</p>
          <p className="mt-2 text-xs text-slate-500">
            Si la obra viene de un presupuesto, las partidas estimadas aparecen acá automáticamente.
            Los usados aparecen cuando registrás una salida de inventario imputada a esta obra.
          </p>
          <Link href={nuevaSalidaHref} className="mt-3 inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3F8E91]">
            + Registrar salida de material
          </Link>
        </div>
      ) : (
        <>
          {/* KPIs de uso real */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Movimientos" value={String(usados.length)} hint="salidas SALIDA imputadas" />
            <KpiCard label="Total unidades" value={totalUnidades.toLocaleString("es-ES")} hint="suma de cantidades" />
            <KpiCard label="Costo materiales" value={fmtEur(totalCosto)} hint="cantidad × costo_unitario" />
            <KpiCard label="Última salida" value={ultimaSalida ? fmtFecha(ultimaSalida) : "—"} hint="fecha del último uso" />
          </div>

          {hayEstimados && (
            <>
              <h3 className="text-sm font-semibold text-slate-700 mt-2">Estimado vs usado</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Material</th>
                      <th className="px-4 py-3 font-semibold text-right">Estimado</th>
                      <th className="px-4 py-3 font-semibold text-right">Usado</th>
                      <th className="px-4 py-3 font-semibold text-right">Diferencia</th>
                      <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">€ estimado</th>
                      <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">€ usado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filas.map((f) => {
                      const dif = f.diferencia;
                      const difCls = dif === 0 ? "text-slate-500"
                        : dif > 0 ? "text-amber-700"
                        : "text-emerald-700";
                      return (
                        <tr key={f.key} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-gray-800">
                            {f.producto_nombre || "—"}
                            {f.sku ? <span className="ml-1 font-mono text-[10px] text-slate-400">{f.sku}</span> : null}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{f.est_cantidad}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{f.usado_cantidad}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${difCls}`}>
                            {dif > 0 ? `+${dif}` : dif}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 hidden md:table-cell">{fmtEur(f.est_total)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold hidden md:table-cell">{fmtEur(f.usado_total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 text-sm">
                    <tr>
                      <td className="px-4 py-2.5 font-semibold text-slate-700" colSpan={4}>Totales</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-700 hidden md:table-cell">{fmtEur(data.totales.estimado_total)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900 hidden md:table-cell">{fmtEur(data.totales.usado_total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                <strong>Diferencia positiva</strong> = se usó más material del estimado (revisión).
                {" "}<strong>Diferencia negativa</strong> = se usó menos (ahorro).
              </p>
            </>
          )}

          {/* Detalle de salidas reales */}
          <h3 className="text-sm font-semibold text-slate-700 mt-4">Materiales usados (salidas reales)</h3>
          {usados.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No hay salidas de inventario imputadas a esta obra todavía.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Material</th>
                    <th className="px-4 py-3 font-semibold text-right">Cantidad</th>
                    <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Costo unit.</th>
                    <th className="px-4 py-3 font-semibold text-right">Costo total</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Motivo</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Usuario</th>
                    <th className="px-4 py-3 font-semibold hidden xl:table-cell">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usados.map((u, i) => (
                    <tr key={`${u.producto_id ?? u.producto_nombre}-${u.fecha}-${i}`} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-700 tabular-nums">{fmtFecha(u.fecha)}</td>
                      <td className="px-4 py-2.5 text-gray-800">
                        {u.producto_nombre || "—"}
                        {u.sku ? <span className="ml-1 font-mono text-[10px] text-slate-400">{u.sku}</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{u.cantidad}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 hidden md:table-cell">{fmtEur(u.costo_unitario)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtEur(u.costo_total)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 hidden lg:table-cell">
                        {u.motivo ? (MOTIVO_LABEL[u.motivo] ?? u.motivo) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 hidden lg:table-cell">
                        {u.usuario_nombre ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 hidden xl:table-cell">
                        {u.observacion ?? <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 text-sm">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-700" colSpan={4}>Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmtEur(totalCosto)}</td>
                    <td colSpan={3} className="hidden lg:table-cell"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
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
