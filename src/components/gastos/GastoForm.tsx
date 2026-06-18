"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createGasto, updateGasto } from "@/lib/gastos/actions";
import MontoInput from "@/components/ui/MontoInput";
import type { Gasto, GastoInput, IvaTipo, Moneda } from "@/lib/gastos/actions";

const IVA_RATES: Record<Exclude<IvaTipo, "exenta">, number> = {
  "21": 0.21,
  "10": 0.10,
  "4": 0.04,
};

const MONEDA_SIMBOLO: Record<Moneda, string> = {
  EUR: "€",
  USD: "$",
  GS: "₲",
};

const fLabel = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
const fInput =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white";

type Props = {
  gasto?: Gasto | null;
  onSuccess?: () => void;
  /** Si viene desde una obra, fija el proyecto y vuelve a returnTo al guardar. */
  proyectoId?: string | null;
  returnTo?: string | null;
};

export default function GastoForm({ gasto, onSuccess, proyectoId, returnTo }: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<GastoInput>({
    categoria: gasto?.categoria ?? "",
    descripcion: gasto?.descripcion ?? "",
    monto: gasto?.monto ?? 0,
    tipo: gasto?.tipo ?? "variable",
    recurrente: gasto?.recurrente ?? false,
    frecuencia: gasto?.frecuencia ?? "",
    fecha: gasto?.fecha ?? new Date().toISOString().slice(0, 10),
    proyecto_id: proyectoId ?? null,
    moneda: gasto?.moneda ?? "EUR",
    banco: gasto?.banco ?? "",
    iva_deducible: gasto?.iva_deducible ?? false,
    iva_tipo: gasto?.iva_tipo ?? null,
    monto_iva: gasto?.monto_iva ?? 0,
  });

  /** IVA estimado a partir del monto total y el tipo elegido. El total incluye
   *  IVA, así que la base es total / (1 + tasa) y el IVA = total − base. */
  const ivaEstimado = useMemo(() => {
    if (!form.iva_deducible || !form.iva_tipo || form.iva_tipo === "exenta") return 0;
    const tasa = IVA_RATES[form.iva_tipo as Exclude<IvaTipo, "exenta">] ?? 0;
    if (!tasa || form.monto <= 0) return 0;
    const base = form.monto / (1 + tasa);
    return Math.round((form.monto - base) * 100) / 100;
  }, [form.iva_deducible, form.iva_tipo, form.monto]);

  // Cada vez que cambia el IVA estimado lo aplicamos al monto_iva guardado.
  // Permite override manual: si el usuario edita monto_iva no lo pisamos.
  const [ivaOverride, setIvaOverride] = useState(false);
  const montoIvaEfectivo = ivaOverride ? form.monto_iva ?? 0 : ivaEstimado;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, recurrente: (e.target as HTMLInputElement).checked }));
    } else if (name !== "monto") {
      const normalized = ["categoria", "descripcion", "frecuencia"].includes(name) ? value.toUpperCase() : value;
      setForm((prev) => ({ ...prev, [name]: normalized }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.monto <= 0) {
      return setError("El monto debe ser mayor a 0.");
    }

    setGuardando(true);

    const payload: GastoInput = {
      ...form,
      monto_iva: form.iva_deducible ? montoIvaEfectivo : 0,
    };

    try {
      if (gasto) {
        await updateGasto(gasto.id, payload);
      } else {
        await createGasto(payload);
      }
      onSuccess?.();
      router.push(returnTo && returnTo.startsWith("/") ? returnTo : "/gastos");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5 pb-2 border-b border-slate-200">
          <span className="text-base">📋</span>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            Datos del gasto
          </h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className={fLabel}>Categoría</label>
            <input
              type="text"
              name="categoria"
              value={form.categoria}
              onChange={handleChange}
              placeholder="Ej: Servicios, Alquiler, Salarios"
              className={fInput}
            />
          </div>
          <div>
            <label className={fLabel}>Descripción</label>
            <textarea
              name="descripcion"
              value={form.descripcion}
              onChange={handleChange}
              placeholder="Descripción del gasto"
              className={fInput}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={fLabel}>
                Monto ({MONEDA_SIMBOLO[form.moneda ?? "EUR"]}) *
              </label>
              <MontoInput
                value={form.monto}
                onChange={(n) => setForm((prev) => ({ ...prev, monto: n }))}
                placeholder="0"
                className={fInput}
                required
              />
            </div>
            <div>
              <label className={fLabel}>Moneda</label>
              <select
                value={form.moneda ?? "EUR"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, moneda: e.target.value as Moneda }))
                }
                className={fInput}
              >
                <option value="EUR">Euros (€)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
          </div>
          <div>
            <label className={fLabel}>Tipo</label>
            <select
              name="tipo"
              value={form.tipo}
              onChange={handleChange}
              className={fInput}
            >
              <option value="variable">Variable</option>
              <option value="fijo">Fijo</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="recurrente"
              name="recurrente"
              checked={form.recurrente}
              onChange={handleChange}
              className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
            />
            <label htmlFor="recurrente" className="text-sm text-slate-700">
              Gasto recurrente
            </label>
          </div>
          {form.recurrente && (
            <div>
              <label className={fLabel}>Frecuencia</label>
              <input
                type="text"
                name="frecuencia"
                value={form.frecuencia ?? ""}
                onChange={handleChange}
                placeholder="Ej: Mensual, Semanal"
                className={fInput}
              />
            </div>
          )}
          <div>
            <label className={fLabel}>Fecha *</label>
            <input
              type="date"
              name="fecha"
              value={form.fecha}
              onChange={handleChange}
              className={fInput}
              required
            />
          </div>

          <div>
            <label className={fLabel}>Banco / medio de pago</label>
            <input
              type="text"
              value={form.banco ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, banco: e.target.value }))}
              placeholder="Ej: Santander, BBVA, Caja Rural, efectivo"
              className={fInput}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Desde dónde se pagó el gasto. Opcional.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.iva_deducible)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    iva_deducible: e.target.checked,
                    iva_tipo: e.target.checked ? prev.iva_tipo ?? "21" : null,
                  }))
                }
                className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
              />
              <span className="font-medium">El IVA es deducible</span>
            </label>
            <p className="text-[11px] text-slate-500 -mt-1">
              Marcá si la factura es a nombre de la empresa y el IVA se descuenta.
              El monto ingresado se considera <strong>con IVA incluido</strong>.
            </p>

            {form.iva_deducible && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={fLabel}>Tipo de IVA</label>
                  <select
                    value={form.iva_tipo ?? "21"}
                    onChange={(e) => {
                      setIvaOverride(false);
                      setForm((prev) => ({
                        ...prev,
                        iva_tipo: e.target.value as IvaTipo,
                      }));
                    }}
                    className={fInput}
                  >
                    <option value="21">21% — General</option>
                    <option value="10">10% — Reducido</option>
                    <option value="4">4% — Superreducido</option>
                    <option value="exenta">Exenta</option>
                  </select>
                </div>
                <div>
                  <label className={fLabel}>IVA deducible ({MONEDA_SIMBOLO[form.moneda ?? "EUR"]})</label>
                  <MontoInput
                    value={montoIvaEfectivo}
                    onChange={(n) => {
                      setIvaOverride(true);
                      setForm((prev) => ({ ...prev, monto_iva: n }));
                    }}
                    placeholder="0"
                    className={fInput}
                    decimals
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Calculado automático según monto y tipo. Editá si la factura
                    desglosa otro importe.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={guardando}
          className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? "Guardando…" : gasto ? "Guardar cambios" : "Crear gasto"}
        </button>
        <button
          type="button"
          onClick={() => router.push(returnTo && returnTo.startsWith("/") ? returnTo : "/gastos")}
          className="border border-slate-200 text-sm px-6 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
