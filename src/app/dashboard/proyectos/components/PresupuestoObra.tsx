"use client";

/**
 * Pestaña "Presupuesto" del detalle de obra.
 *
 * Lee el snapshot del presupuesto guardado en proyectos.brief_data por el
 * endpoint /api/ventas/[id]/convertir-obra (al convertir el presupuesto en
 * obra). No requiere endpoint extra: todo viene del brief_data del proyecto.
 *
 * Las partidas son ESTIMADAS — no descontaron stock ni generaron movimientos.
 * Para los costos reales ver la pestaña Materiales (estimado vs usado).
 */

const fmtEur = (n: number) =>
  `€ ${Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Partida = {
  producto_id: string | null;
  producto_nombre: string;
  sku: string;
  tipo_partida: string;
  descripcion: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  monto_iva: number;
  total_linea: number;
};

type Totales = {
  subtotal: number;
  iva: number;
  total: number;
  margen_pct?: number | null;
  margen_monto?: number | null;
};

const TIPO_PARTIDA_LABEL: Record<string, string> = {
  producto: "Material",
  mano_obra: "Mano de obra",
  servicio: "Servicio",
  transporte: "Transporte",
  alquiler_equipo: "Alquiler",
  retiro_escombros: "Escombros",
  seguridad_andamio: "Seguridad",
  limpieza_final: "Limpieza",
  otro: "Otro",
};

export default function PresupuestoObra({ brief }: { brief: Record<string, unknown> | null | undefined }) {
  const b = brief ?? {};
  const origen = b.source === "presupuesto_obra" || b.origen === "presupuesto";
  const numero = typeof b.presupuesto_numero === "string"
    ? b.presupuesto_numero
    : typeof b.numero_control === "string" ? b.numero_control : null;
  const partidas = (Array.isArray(b.partidas) ? b.partidas
                   : Array.isArray(b.items) ? b.items
                   : []) as Partida[];
  const totales = (b.totales as Totales | undefined) ?? null;
  const validez = typeof b.validez_dias === "number" ? b.validez_dias : null;
  const formaPago = typeof b.forma_pago === "string" ? b.forma_pago : null;
  const exclusiones = typeof b.exclusiones === "string" ? b.exclusiones : null;
  const garantiaMO = typeof b.garantia_mano_obra === "string" ? b.garantia_mano_obra : null;
  const garantiaMat = typeof b.garantia_materiales === "string" ? b.garantia_materiales : null;

  if (!origen) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
        <p className="font-medium text-slate-800">Esta obra no tiene presupuesto vinculado.</p>
        <p className="mt-2 text-xs text-slate-500">
          Para presupuestos de obra, creá uno desde <span className="font-medium">Ventas → Nuevo presupuesto de obra</span>,
          aprobalo y convertirlo en obra.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        Estas partidas son la <strong>estimación del presupuesto</strong> original. No descontaron stock
        ni generaron movimientos. Los costos reales se ven en la pestaña Materiales (estimado vs usado).
        {numero ? <> Origen: <strong>{numero}</strong>.</> : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Descripción</th>
              <th className="px-4 py-3 font-semibold text-right">Cant.</th>
              <th className="px-4 py-3 font-semibold text-right">P. unit.</th>
              <th className="px-4 py-3 font-semibold text-right">Subtotal</th>
              <th className="px-4 py-3 font-semibold text-right">IVA</th>
              <th className="px-4 py-3 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {partidas.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">Sin partidas.</td></tr>
            ) : partidas.map((p, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                    {TIPO_PARTIDA_LABEL[p.tipo_partida] ?? p.tipo_partida}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-800">
                  {p.producto_nombre || p.descripcion || "—"}
                  {p.sku ? <span className="ml-1 font-mono text-[10px] text-slate-400">{p.sku}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{p.cantidad}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(p.precio_unitario)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(p.subtotal)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{fmtEur(p.monto_iva)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtEur(p.total_linea)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totales && (
        <div className="flex justify-end">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal sin IVA</span>
              <span className="tabular-nums">{fmtEur(totales.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>IVA</span>
              <span className="tabular-nums">{fmtEur(totales.iva)}</span>
            </div>
            {totales.margen_pct != null && totales.margen_pct > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Margen ({totales.margen_pct}%)</span>
                <span className="tabular-nums">—</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Total presupuestado</span>
              <span className="tabular-nums">{fmtEur(totales.total)}</span>
            </div>
          </div>
        </div>
      )}

      {(garantiaMO || garantiaMat || formaPago || exclusiones || validez) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {garantiaMO && <InfoBox label="Garantía mano de obra" value={garantiaMO} />}
          {garantiaMat && <InfoBox label="Garantía materiales" value={garantiaMat} />}
          {formaPago && <InfoBox label="Forma de pago" value={formaPago} />}
          {validez != null && <InfoBox label="Validez del presupuesto" value={`${validez} días`} />}
          {exclusiones && <InfoBox label="Exclusiones" value={exclusiones} fullWidth />}
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 ${fullWidth ? "sm:col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}
