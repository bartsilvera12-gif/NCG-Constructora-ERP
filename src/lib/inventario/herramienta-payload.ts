/**
 * Helpers para normalizar y validar el payload de herramienta al crear o
 * actualizar productos.
 *
 * Mantiene fuera del route handler la lógica de "qué campos persistir según
 * la condición al alta" y la derivación de `estado_operativo` cuando se
 * marca `requiere_mantenimiento_inicial`.
 */

export type CondicionAlta = "nueva" | "usada" | "reacondicionada";
export type EstadoOperativo = "disponible" | "asignada" | "en_mantenimiento" | "baja";

const CONDICIONES_VALIDAS: ReadonlySet<CondicionAlta> = new Set(["nueva", "usada", "reacondicionada"]);
const ESTADOS_OPERATIVOS: ReadonlySet<EstadoOperativo> = new Set([
  "disponible",
  "asignada",
  "en_mantenimiento",
  "baja",
]);
const PROCEDENCIAS = new Set(["compra_usada", "ya_existia", "otra"]);
const CONDICIONES_ACTUALES = new Set(["buena", "regular", "requiere_revision"]);

function asStr(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  return null;
}

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asInt(v: unknown): number | null {
  const n = asNum(v);
  if (n == null) return null;
  return Math.trunc(n);
}

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function asDate(v: unknown): string | null {
  const s = asStr(v);
  if (!s) return null;
  // Solo aceptamos YYYY-MM-DD: la columna en DB es DATE.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export type HerramientaFields = {
  condicion_alta: CondicionAlta | null;
  estado_operativo: EstadoOperativo | null;
  fecha_compra: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  costo_adquisicion: number | null;
  numero_comprobante: string | null;
  garantia: boolean | null;
  garantia_fin: string | null;
  vida_util_estimada_meses: number | null;
  vida_util_restante_meses: number | null;
  procedencia: string | null;
  condicion_actual: string | null;
  requiere_mantenimiento_inicial: boolean | null;
  fecha_reacondicionamiento: string | null;
  costo_reacondicionamiento: number | null;
  herramienta_observacion: string | null;
};

export type HerramientaParseResult =
  | { ok: true; fields: HerramientaFields }
  | { ok: false; error: string };

/**
 * Parsea + valida los campos de herramienta del body de un POST/PATCH.
 *
 * Reglas:
 *  - Si `condicion_alta='nueva'` y se pide costo_adquisicion=0 explícito, se
 *    rechaza. Si no se manda, queda NULL (la UI ya valida obligatorio).
 *  - Si `garantia=true`, exige `garantia_fin`.
 *  - Si `requiere_mantenimiento_inicial=true`, fuerza
 *    `estado_operativo='en_mantenimiento'` (override del valor que viniera).
 *  - Si no se especifica `estado_operativo`, default 'disponible'.
 */
export function parseHerramientaPayload(body: Record<string, unknown>): HerramientaParseResult {
  const condRaw = asStr(body.condicion_alta);
  const condicion_alta: CondicionAlta | null =
    condRaw && CONDICIONES_VALIDAS.has(condRaw as CondicionAlta) ? (condRaw as CondicionAlta) : null;

  const procRaw = asStr(body.procedencia);
  const procedencia = procRaw && PROCEDENCIAS.has(procRaw) ? procRaw : null;

  const condActRaw = asStr(body.condicion_actual);
  const condicion_actual = condActRaw && CONDICIONES_ACTUALES.has(condActRaw) ? condActRaw : null;

  const garantia = asBool(body.garantia);
  const garantia_fin = asDate(body.garantia_fin);

  if (garantia === true && !garantia_fin) {
    return { ok: false, error: "Indicaste garantía pero falta la fecha fin de garantía." };
  }

  const requiere_mantenimiento_inicial = asBool(body.requiere_mantenimiento_inicial);

  // Estado operativo: si requiere mantenimiento inicial, se fuerza.
  let estado_operativo: EstadoOperativo | null = null;
  if (requiere_mantenimiento_inicial === true) {
    estado_operativo = "en_mantenimiento";
  } else {
    const eoRaw = asStr(body.estado_operativo);
    estado_operativo =
      eoRaw && ESTADOS_OPERATIVOS.has(eoRaw as EstadoOperativo)
        ? (eoRaw as EstadoOperativo)
        : "disponible";
  }

  return {
    ok: true,
    fields: {
      condicion_alta,
      estado_operativo,
      fecha_compra: asDate(body.fecha_compra),
      proveedor_id: asStr(body.proveedor_id),
      proveedor_nombre: asStr(body.proveedor_nombre),
      costo_adquisicion: asNum(body.costo_adquisicion),
      numero_comprobante: asStr(body.numero_comprobante),
      garantia,
      garantia_fin,
      vida_util_estimada_meses: asInt(body.vida_util_estimada_meses),
      vida_util_restante_meses: asInt(body.vida_util_restante_meses),
      procedencia,
      condicion_actual,
      requiere_mantenimiento_inicial,
      fecha_reacondicionamiento: asDate(body.fecha_reacondicionamiento),
      costo_reacondicionamiento: asNum(body.costo_reacondicionamiento),
      herramienta_observacion: asStr(body.herramienta_observacion),
    },
  };
}

/** Lista de columnas de herramienta para el SELECT en API. */
export const HERRAMIENTA_COLS = [
  "condicion_alta",
  "estado_operativo",
  "fecha_compra",
  "proveedor_id",
  "proveedor_nombre",
  "costo_adquisicion",
  "numero_comprobante",
  "garantia",
  "garantia_fin",
  "vida_util_estimada_meses",
  "vida_util_restante_meses",
  "procedencia",
  "condicion_actual",
  "requiere_mantenimiento_inicial",
  "fecha_reacondicionamiento",
  "costo_reacondicionamiento",
  "herramienta_observacion",
].join(", ");
