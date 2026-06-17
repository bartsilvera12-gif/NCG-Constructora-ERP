"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MontoInput from "@/components/ui/MontoInput";
import SelectFromList from "@/components/inventario/SelectFromList";

export type CondicionAlta = "nueva" | "usada" | "reacondicionada";

export type HerramientaCondicionData = {
  condicion_alta: CondicionAlta;
  // Nueva
  fecha_compra: string;
  proveedor_id: string | null;
  costo_adquisicion: string;
  numero_comprobante: string;
  garantia: boolean;
  garantia_fin: string;
  vida_util_estimada_meses: string;
  // Usada
  procedencia: "" | "compra_usada" | "ya_existia" | "otra";
  condicion_actual: "" | "buena" | "regular" | "requiere_revision";
  vida_util_restante_meses: string;
  requiere_mantenimiento_inicial: boolean;
  // Reacondicionada
  fecha_reacondicionamiento: string;
  costo_reacondicionamiento: string;
  // Comun
  herramienta_observacion: string;
};

export const EMPTY_HERRAMIENTA: HerramientaCondicionData = {
  condicion_alta: "nueva",
  fecha_compra: "",
  proveedor_id: null,
  costo_adquisicion: "",
  numero_comprobante: "",
  garantia: false,
  garantia_fin: "",
  vida_util_estimada_meses: "",
  procedencia: "",
  condicion_actual: "",
  vida_util_restante_meses: "",
  requiere_mantenimiento_inicial: false,
  fecha_reacondicionamiento: "",
  costo_reacondicionamiento: "",
  herramienta_observacion: "",
};

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none bg-white text-sm";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

type ProveedorLite = { id: string; nombre: string };

const CONDICIONES: {
  value: CondicionAlta;
  titulo: string;
  desc: string;
  acento: string;
  textoAcento: string;
  ayuda: string;
}[] = [
  {
    value: "nueva",
    titulo: "Nueva",
    desc: "Adquisición reciente, sin uso previo.",
    acento: "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300",
    textoAcento: "text-emerald-800",
    ayuda: "Herramienta adquirida nueva, sin uso previo.",
  },
  {
    value: "usada",
    titulo: "Usada",
    desc: "Con uso previo o adquirida de segunda mano.",
    acento: "border-amber-400 bg-amber-50 ring-1 ring-amber-300",
    textoAcento: "text-amber-800",
    ayuda:
      "Herramienta con uso previo. No confundir con una herramienta que ya existe en la empresa y vuelve de otra obra: en ese caso usá Devolución / Transferencia, no la cargues como nueva fila.",
  },
  {
    value: "reacondicionada",
    titulo: "Reacondicionada",
    desc: "Pasó por mantenimiento mayor antes de incorporarse.",
    acento: "border-sky-400 bg-sky-50 ring-1 ring-sky-300",
    textoAcento: "text-sky-800",
    ayuda:
      "Herramienta reacondicionada: se le hizo una intervención mayor antes de incorporarla.",
  },
];

export function validateHerramientaForm(
  data: HerramientaCondicionData
): string | null {
  const num = (s: string) => {
    const n = Number(String(s).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  if (data.condicion_alta === "nueva") {
    const costo = num(data.costo_adquisicion);
    if (!Number.isFinite(costo) || costo <= 0) {
      return "El costo de adquisición es obligatorio para herramientas nuevas.";
    }
    if (data.garantia && !data.garantia_fin) {
      return "Si la herramienta tiene garantía, completá la fecha fin de garantía.";
    }
  }
  if (data.condicion_alta === "usada") {
    // costo estimado es recomendado, no obligatorio (spec).
  }
  if (data.condicion_alta === "reacondicionada") {
    if (!data.fecha_reacondicionamiento) {
      return "La fecha de reacondicionamiento es obligatoria.";
    }
  }
  return null;
}

/**
 * Convierte el estado del form en el payload que viaja al backend. Solo se
 * incluyen los campos relevantes para la condición elegida; el resto quedan
 * `null` para que el backend los limpie.
 */
export function buildHerramientaPayload(data: HerramientaCondicionData): Record<string, unknown> {
  const toDate = (s: string) => (s.trim() ? s.trim() : null);
  const toNum = (s: string): number | null => {
    const t = s.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const toInt = (s: string): number | null => {
    const n = toNum(s);
    return n == null ? null : Math.trunc(n);
  };
  const toStr = (s: string) => (s.trim() ? s.trim() : null);

  const c = data.condicion_alta;
  return {
    condicion_alta: c,
    fecha_compra: c === "nueva" ? toDate(data.fecha_compra) : null,
    proveedor_id: c === "nueva" ? data.proveedor_id : null,
    proveedor_nombre: null, // se resuelve desde proveedor_id en server si aplica
    costo_adquisicion: c === "nueva" ? toNum(data.costo_adquisicion) : null,
    numero_comprobante: c === "nueva" ? toStr(data.numero_comprobante) : null,
    garantia: c === "nueva" ? data.garantia : null,
    garantia_fin: c === "nueva" && data.garantia ? toDate(data.garantia_fin) : null,
    vida_util_estimada_meses: c === "nueva" ? toInt(data.vida_util_estimada_meses) : null,
    procedencia: c === "usada" || c === "reacondicionada" ? toStr(data.procedencia) : null,
    condicion_actual:
      c === "usada" || c === "reacondicionada" ? toStr(data.condicion_actual) : null,
    vida_util_restante_meses:
      c === "usada" || c === "reacondicionada" ? toInt(data.vida_util_restante_meses) : null,
    requiere_mantenimiento_inicial:
      c === "usada" || c === "reacondicionada" ? data.requiere_mantenimiento_inicial : null,
    fecha_reacondicionamiento:
      c === "reacondicionada" ? toDate(data.fecha_reacondicionamiento) : null,
    costo_reacondicionamiento:
      c === "reacondicionada" ? toNum(data.costo_reacondicionamiento) : null,
    herramienta_observacion: toStr(data.herramienta_observacion),
  };
}

export default function HerramientaCondicionForm({
  value,
  onChange,
  proveedores,
}: {
  value: HerramientaCondicionData;
  onChange: (next: HerramientaCondicionData) => void;
  proveedores: ProveedorLite[];
}) {
  const set = (patch: Partial<HerramientaCondicionData>) => onChange({ ...value, ...patch });
  const condInfo = useMemo(
    () => CONDICIONES.find((c) => c.value === value.condicion_alta) ?? CONDICIONES[0],
    [value.condicion_alta]
  );

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Condición al alta</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {CONDICIONES.map((opt) => {
            const activo = value.condicion_alta === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set({ condicion_alta: opt.value })}
                className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                  activo
                    ? opt.acento
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${activo ? opt.textoAcento : "text-slate-700"}`}
                >
                  {opt.titulo}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.desc}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">{condInfo.ayuda}</p>
      </div>

      {/* Aviso para no duplicar herramientas que ya existen */}
      {value.condicion_alta === "usada" ? <AvisoNoDuplicar /> : null}

      {/* Bloque "Nueva" */}
      {value.condicion_alta === "nueva" && (
        <BloqueNueva value={value} set={set} proveedores={proveedores} />
      )}

      {/* Bloque "Usada" */}
      {value.condicion_alta === "usada" && <BloqueUsada value={value} set={set} />}

      {/* Bloque "Reacondicionada" */}
      {value.condicion_alta === "reacondicionada" && (
        <BloqueReacondicionada value={value} set={set} />
      )}

      <div>
        <label className={labelClass}>Observación</label>
        <textarea
          rows={2}
          value={value.herramienta_observacion}
          onChange={(e) => set({ herramienta_observacion: e.target.value })}
          placeholder="Notas internas sobre el alta de esta herramienta"
          className={inputClass}
        />
      </div>
    </div>
  );
}

function AvisoNoDuplicar() {
  const [oculto, setOculto] = useState(false);
  // Persistir "ocultar" por sesión así no estorba al usuario que ya lo leyó.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const k = "zentra:inventario:aviso-no-duplicar";
    if (sessionStorage.getItem(k) === "1") setOculto(true);
  }, []);
  if (oculto) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
      <p className="font-semibold mb-1">⚠ ¿La herramienta ya existe en la empresa?</p>
      <p>
        Si solo vuelve de otra obra o se cambia de obra,{" "}
        <strong>no la cargues como nueva fila</strong>: hacé una{" "}
        <Link href="/inventario/movimientos/nuevo" className="underline">
          devolución / transferencia
        </Link>{" "}
        sobre la herramienta existente. Esto evita duplicados.
      </p>
      <button
        type="button"
        onClick={() => {
          setOculto(true);
          try {
            sessionStorage.setItem("zentra:inventario:aviso-no-duplicar", "1");
          } catch {
            // ignore
          }
        }}
        className="mt-2 text-[11px] text-amber-700 hover:text-amber-900 underline"
      >
        Entendido, no mostrar de nuevo en esta sesión
      </button>
    </div>
  );
}

function BloqueNueva({
  value,
  set,
  proveedores,
}: {
  value: HerramientaCondicionData;
  set: (patch: Partial<HerramientaCondicionData>) => void;
  proveedores: ProveedorLite[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
        Datos de adquisición
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Fecha de compra</label>
          <input
            type="date"
            value={value.fecha_compra}
            onChange={(e) => set({ fecha_compra: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            Costo de adquisición (€) <span className="text-rose-600">*</span>
          </label>
          <MontoInput
            value={value.costo_adquisicion}
            onChange={(n) => set({ costo_adquisicion: String(n) })}
            placeholder="Ej: 250,00"
            className={inputClass}
            decimals
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Proveedor</label>
          <SelectFromList
            value={value.proveedor_id}
            onChange={(id) => set({ proveedor_id: id })}
            options={proveedores.map((p) => ({ id: p.id, label: p.nombre }))}
            emptyShort="Sin proveedores"
          />
        </div>
        <div>
          <label className={labelClass}>N° de factura / comprobante</label>
          <input
            type="text"
            value={value.numero_comprobante}
            onChange={(e) => set({ numero_comprobante: e.target.value })}
            placeholder="Ej: F2026-000125"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Vida útil estimada (meses)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={value.vida_util_estimada_meses}
            onChange={(e) => set({ vida_util_estimada_meses: e.target.value })}
            placeholder="Ej: 48"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.garantia}
              onChange={(e) => set({ garantia: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Tiene garantía
          </label>
          {value.garantia && (
            <div className="flex-1">
              <input
                type="date"
                value={value.garantia_fin}
                onChange={(e) => set({ garantia_fin: e.target.value })}
                className={inputClass}
                aria-label="Fecha fin de garantía"
                required
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BloqueUsada({
  value,
  set,
}: {
  value: HerramientaCondicionData;
  set: (patch: Partial<HerramientaCondicionData>) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
        Datos de la herramienta usada
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Procedencia</label>
          <select
            value={value.procedencia}
            onChange={(e) =>
              set({ procedencia: e.target.value as HerramientaCondicionData["procedencia"] })
            }
            className={inputClass}
          >
            <option value="">Seleccionar…</option>
            <option value="compra_usada">Compra usada</option>
            <option value="ya_existia">Ya existía en la empresa</option>
            <option value="otra">Otra procedencia</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Condición actual</label>
          <select
            value={value.condicion_actual}
            onChange={(e) =>
              set({ condicion_actual: e.target.value as HerramientaCondicionData["condicion_actual"] })
            }
            className={inputClass}
          >
            <option value="">Seleccionar…</option>
            <option value="buena">Buena</option>
            <option value="regular">Regular</option>
            <option value="requiere_revision">Requiere revisión</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Costo estimado / valor actual (€)</label>
          <MontoInput
            value={value.costo_adquisicion}
            onChange={(n) => set({ costo_adquisicion: String(n) })}
            placeholder="Ej: 80,00"
            className={inputClass}
            decimals
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Sugerido. Sirve para imputar costos de uso a obra.
          </p>
        </div>
        <div>
          <label className={labelClass}>Vida útil restante estimada (meses)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={value.vida_util_restante_meses}
            onChange={(e) => set({ vida_util_restante_meses: e.target.value })}
            placeholder="Ej: 18"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.requiere_mantenimiento_inicial}
              onChange={(e) => set({ requiere_mantenimiento_inicial: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            Requiere mantenimiento inicial
          </label>
          {value.requiere_mantenimiento_inicial && (
            <p className="mt-1 text-[11px] text-amber-700">
              Al marcar esto, la herramienta queda en estado operativo{" "}
              <strong>En mantenimiento</strong> hasta que termine la revisión.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BloqueReacondicionada({
  value,
  set,
}: {
  value: HerramientaCondicionData;
  set: (patch: Partial<HerramientaCondicionData>) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
        Datos del reacondicionamiento
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Procedencia</label>
          <select
            value={value.procedencia}
            onChange={(e) =>
              set({ procedencia: e.target.value as HerramientaCondicionData["procedencia"] })
            }
            className={inputClass}
          >
            <option value="">Seleccionar…</option>
            <option value="compra_usada">Compra usada</option>
            <option value="ya_existia">Ya existía en la empresa</option>
            <option value="otra">Otra procedencia</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>
            Fecha de reacondicionamiento <span className="text-rose-600">*</span>
          </label>
          <input
            type="date"
            value={value.fecha_reacondicionamiento}
            onChange={(e) => set({ fecha_reacondicionamiento: e.target.value })}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Costo de reacondicionamiento (€)</label>
          <MontoInput
            value={value.costo_reacondicionamiento}
            onChange={(n) => set({ costo_reacondicionamiento: String(n) })}
            placeholder="Ej: 120,00"
            className={inputClass}
            decimals
          />
        </div>
        <div>
          <label className={labelClass}>Condición actual</label>
          <select
            value={value.condicion_actual}
            onChange={(e) =>
              set({ condicion_actual: e.target.value as HerramientaCondicionData["condicion_actual"] })
            }
            className={inputClass}
          >
            <option value="">Seleccionar…</option>
            <option value="buena">Buena</option>
            <option value="regular">Regular</option>
            <option value="requiere_revision">Requiere revisión</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Vida útil restante estimada (meses)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={value.vida_util_restante_meses}
            onChange={(e) => set({ vida_util_restante_meses: e.target.value })}
            placeholder="Ej: 24"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.requiere_mantenimiento_inicial}
              onChange={(e) => set({ requiere_mantenimiento_inicial: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            Requiere revisión adicional antes de usarla
          </label>
        </div>
      </div>
    </div>
  );
}
