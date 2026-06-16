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

type Resp = {
  combinado: Combinado[];
  totales: { estimado_total: number; usado_total: number };
};

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
  const sinDatos = filas.length === 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        Comparativa de <strong>materiales estimados</strong> (presupuesto) vs <strong>materiales usados</strong>
        (salidas reales de inventario imputadas a esta obra). Los estimados no descuentan stock; solo los usados sí.
      </div>

      {sinDatos ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-800">Todavía no hay materiales en esta obra.</p>
          <p className="mt-2 text-xs text-slate-500">
            Si la obra viene de un presupuesto, las partidas estimadas aparecen acá automáticamente.
            Los usados aparecen cuando registrás una salida de inventario imputada a esta obra.
          </p>
          <Link href="/inventario" className="mt-3 inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3F8E91]">
            Ir a Inventario
          </Link>
        </div>
      ) : (
        <>
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
    </div>
  );
}
