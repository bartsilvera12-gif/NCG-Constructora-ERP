/**
 * Helpers de cálculo para asignaciones de mano de obra por período.
 * Puro: sin acceso a red ni DB. Usado tanto en cliente como en server.
 */

export type DiasTrabajoTipo = "lun_vie" | "lun_sab" | "todos" | "manual";

export const DIAS_TRABAJO_LABEL: Record<DiasTrabajoTipo, string> = {
  lun_vie: "Lunes a viernes",
  lun_sab: "Lunes a sábado",
  todos: "Todos los días",
  manual: "Manual",
};

export function isDiasTrabajoTipo(value: unknown): value is DiasTrabajoTipo {
  return value === "lun_vie" || value === "lun_sab" || value === "todos" || value === "manual";
}

/**
 * Parsea una fecha ISO (YYYY-MM-DD) como UTC para evitar drift de zona horaria
 * al iterar día a día. No usar para fechas con horas; solo para fechas de
 * calendario.
 */
function parseISODateUTC(iso: string): Date | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (!Number.isFinite(dt.getTime())) return null;
  return dt;
}

/**
 * Cuenta días trabajables entre `desde` y `hasta` (ambos inclusivos) según
 * el tipo de calendario. Devuelve 0 si fechas inválidas o hasta < desde.
 *
 * Para tipo='manual' devuelve 0 — los días manuales los ingresa el usuario.
 */
export function diasTrabajablesEntre(
  desdeISO: string,
  hastaISO: string,
  tipo: DiasTrabajoTipo
): number {
  if (tipo === "manual") return 0;
  const d0 = parseISODateUTC(desdeISO);
  const d1 = parseISODateUTC(hastaISO);
  if (!d0 || !d1) return 0;
  if (d1.getTime() < d0.getTime()) return 0;

  let count = 0;
  const cur = new Date(d0.getTime());
  while (cur.getTime() <= d1.getTime()) {
    const dow = cur.getUTCDay(); // 0=Dom 1=Lun ... 6=Sab
    if (tipo === "todos") count++;
    else if (tipo === "lun_vie" && dow >= 1 && dow <= 5) count++;
    else if (tipo === "lun_sab" && dow >= 1 && dow <= 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export type CalculoEntrada = {
  fecha_desde: string;
  fecha_hasta: string;
  horas_por_dia: number;
  costo_hora: number;
  dias_trabajo_tipo: DiasTrabajoTipo;
  /** Sólo se usa cuando dias_trabajo_tipo='manual'. */
  dias_manual?: number | null;
};

export type CalculoResultado = {
  dias: number;
  horas: number;
  costo: number;
};

export function calcularEstimado(input: CalculoEntrada): CalculoResultado {
  const horasDia = Number(input.horas_por_dia) || 0;
  const costoHora = Number(input.costo_hora) || 0;
  let dias: number;
  if (input.dias_trabajo_tipo === "manual") {
    dias = Math.max(0, Math.floor(Number(input.dias_manual ?? 0)));
  } else {
    dias = diasTrabajablesEntre(input.fecha_desde, input.fecha_hasta, input.dias_trabajo_tipo);
  }
  const horas = dias * horasDia;
  const costo = horas * costoHora;
  return { dias, horas, costo };
}

/**
 * Detecta si dos rangos de fechas (inclusivos) se solapan. Acepta fechas en
 * formato YYYY-MM-DD. Si alguna está vacía, se considera abierta (no solapa).
 */
export function rangosSeSuperponen(
  aDesde: string,
  aHasta: string,
  bDesde: string,
  bHasta: string
): boolean {
  if (!aDesde || !aHasta || !bDesde || !bHasta) return false;
  return aDesde <= bHasta && bDesde <= aHasta;
}
