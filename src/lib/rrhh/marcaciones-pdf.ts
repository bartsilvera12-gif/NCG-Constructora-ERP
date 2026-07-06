/**
 * Reporte PDF de marcaciones (fichajes) por empleado / rango de fechas.
 * pdf-lib, A4 apaisado para caber más columnas.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export type MarcacionRow = {
  fecha: string;
  empleado_id?: string | null;
  empleado_nombre: string | null;
  hora_entrada: string | null;
  hora_salida: string | null;
  horas: number | null;
  observacion: string | null;
  marcado_kiosco: boolean | null;
};

export type MarcacionesEmpresa = {
  nombre: string | null;
  nif: string | null;
  centro: string | null;
};

export type FeriadoRow = {
  fecha: string;   // yyyy-mm-dd
  nombre: string;
};

export type AusenciaRow = {
  empleado_id: string;
  fecha_desde: string;
  fecha_hasta: string;
  tipo: "reposo" | "vacaciones" | "permiso" | "baja" | "otro";
  observacion: string | null;
};

const AUSENCIA_LABEL: Record<AusenciaRow["tipo"], string> = {
  reposo: "Reposo",
  vacaciones: "Vacaciones",
  permiso: "Permiso",
  baja: "Baja",
  otro: "Ausencia",
};

const A4_W = 841.89;   // landscape
const A4_H = 595.28;
const MARGIN = 32;
const BLACK: RGB = rgb(0, 0, 0);
const SLATE: RGB = rgb(0.35, 0.4, 0.46);
const ACCENT: RGB = rgb(0.31, 0.68, 0.7);
const FILL: RGB = rgb(0.95, 0.97, 0.97);
// Colores para filas de día especial (fondo suave).
const BG_FERIADO: RGB = rgb(1.0, 0.97, 0.85);  // amarillo claro
const BG_AUSENCIA: RGB = rgb(1.0, 0.92, 0.92); // rojo muy claro
const BG_FERIADO_TRABAJADO: RGB = rgb(1.0, 0.9, 0.75); // naranja claro (feriado + trabajó = extra)

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function fmtHora(h: string | null): string {
  if (!h) return "—";
  return h.slice(0, 5);
}
function num(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

type Ctx = { doc: PDFDocument; page: PDFPage; font: PDFFont; fontB: PDFFont; y: number };

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([A4_W, A4_H]);
  ctx.y = A4_H - MARGIN;
}

function text(ctx: Ctx, s: string, x: number, y: number, opts: { bold?: boolean; size?: number; color?: RGB; align?: "left" | "right" | "center" } = {}) {
  const size = opts.size ?? 8;
  const font = opts.bold ? ctx.fontB : ctx.font;
  const color = opts.color ?? BLACK;
  if (opts.align === "right") {
    const w = font.widthOfTextAtSize(s, size);
    ctx.page.drawText(s, { x: x - w, y, size, font, color });
  } else if (opts.align === "center") {
    const w = font.widthOfTextAtSize(s, size);
    ctx.page.drawText(s, { x: x - w / 2, y, size, font, color });
  } else {
    ctx.page.drawText(s, { x, y, size, font, color });
  }
}

export async function buildMarcacionesPdf(
  empresa: MarcacionesEmpresa,
  empleadoNombre: string | null,
  desde: string,
  hasta: string,
  filas: MarcacionRow[],
  extras?: { feriados?: FeriadoRow[]; ausencias?: (AusenciaRow & { empleado_nombre?: string | null })[]; empleadoIdFiltro?: string | null },
): Promise<Uint8Array> {
  const feriadosMap = new Map<string, string>();
  for (const f of extras?.feriados ?? []) feriadosMap.set(f.fecha, f.nombre);
  const ausencias = extras?.ausencias ?? [];
  // Helper: dado una fecha + empleado_id, retorna la ausencia que aplica (o null).
  const ausenciaEnFecha = (fecha: string, empleadoId: string | null) =>
    ausencias.find(
      (a) =>
        (!empleadoId || a.empleado_id === empleadoId) &&
        a.fecha_desde <= fecha &&
        a.fecha_hasta >= fecha
    ) ?? null;
  const empleadoIdFiltro = extras?.empleadoIdFiltro ?? null;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4_W, A4_H]);
  const ctx: Ctx = { doc, page, font, fontB, y: A4_H - MARGIN };

  // Header
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 30, width: A4_W - MARGIN * 2, height: 30, color: ACCENT });
  text(ctx, "REPORTE DE MARCACIONES", MARGIN + 12, ctx.y - 14, { bold: true, size: 12, color: rgb(1, 1, 1) });
  text(ctx, empresa.nombre ?? "", MARGIN + 12, ctx.y - 26, { size: 8, color: rgb(1, 1, 1) });
  // WinAnsi (encoding de StandardFonts.Helvetica) no soporta "→" (0x2192).
  // Usamos "-" para no requerir embed de una fuente custom.
  const rangoTxt = `${fmtFecha(desde)}  -  ${fmtFecha(hasta)}`;
  text(ctx, rangoTxt, A4_W - MARGIN - 12, ctx.y - 22, { bold: true, size: 10, color: rgb(1, 1, 1), align: "right" });
  ctx.y -= 42;

  // Sub-header con filtros
  text(ctx, "Empleado:", MARGIN, ctx.y, { bold: true, size: 9 });
  text(ctx, empleadoNombre ?? "Todos", MARGIN + 60, ctx.y, { size: 9 });
  if (empresa.nif) {
    text(ctx, `NIF: ${empresa.nif}`, MARGIN + 400, ctx.y, { size: 9, color: SLATE });
  }
  if (empresa.centro) {
    text(ctx, `Centro: ${empresa.centro}`, MARGIN + 500, ctx.y, { size: 9, color: SLATE });
  }
  ctx.y -= 18;

  // Tabla
  const cols = [
    { label: "Fecha",       x: MARGIN,        w: 68  },
    { label: "Empleado",    x: MARGIN + 70,   w: 200 },
    { label: "Entrada",     x: MARGIN + 275,  w: 55  },
    { label: "Salida",      x: MARGIN + 335,  w: 55  },
    { label: "Horas",       x: MARGIN + 395,  w: 45,  align: "right" as const },
    { label: "Marcado por", x: MARGIN + 445,  w: 60,  align: "center" as const },
    { label: "Observación", x: MARGIN + 510,  w: 265 },
  ];
  const drawHeader = () => {
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 14, width: A4_W - MARGIN * 2, height: 14, color: FILL });
    for (const c of cols) {
      const tx = c.align === "right" ? c.x + c.w - 4 : c.align === "center" ? c.x + c.w / 2 : c.x + 4;
      text(ctx, c.label, tx, ctx.y - 10, { bold: true, size: 8, align: c.align });
    }
    ctx.y -= 16;
  };
  drawHeader();

  let totalHoras = 0;
  let horasFeriado = 0;
  const empleadosSet = new Set<string>();

  for (const r of filas) {
    if (ctx.y < MARGIN + 40) {
      newPage(ctx);
      drawHeader();
    }

    if (r.empleado_nombre) empleadosSet.add(r.empleado_nombre);
    const h = num(r.horas);
    totalHoras += h;

    // Determinar tipo de día para el color de fondo y el tag.
    const nombreFeriado = feriadosMap.get(r.fecha) ?? null;
    const ausencia = ausenciaEnFecha(r.fecha, r.empleado_id ?? null);
    let bg: RGB | null = null;
    let tag = "";
    if (nombreFeriado) {
      if (h > 0) {
        bg = BG_FERIADO_TRABAJADO;
        tag = `Feriado (trabajado): ${nombreFeriado}`;
        horasFeriado += h;
      } else {
        bg = BG_FERIADO;
        tag = `Feriado: ${nombreFeriado}`;
      }
    } else if (ausencia) {
      bg = BG_AUSENCIA;
      tag = AUSENCIA_LABEL[ausencia.tipo] + (ausencia.observacion ? `: ${ausencia.observacion}` : "");
    }
    if (bg) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 14, width: A4_W - MARGIN * 2, height: 14, color: bg });
    }

    text(ctx, fmtFecha(r.fecha), cols[0].x + 4, ctx.y - 9, { size: 8 });
    text(ctx, r.empleado_nombre ?? "—", cols[1].x + 4, ctx.y - 9, { size: 8 });
    text(ctx, fmtHora(r.hora_entrada), cols[2].x + 4, ctx.y - 9, { size: 8 });
    text(ctx, fmtHora(r.hora_salida), cols[3].x + 4, ctx.y - 9, { size: 8 });
    text(ctx, h ? h.toFixed(2) : "—", cols[4].x + cols[4].w - 4, ctx.y - 9, { size: 8, align: "right" });
    text(ctx, r.marcado_kiosco ? "Empleado" : "Admin", cols[5].x + cols[5].w / 2, ctx.y - 9, { size: 7.5, align: "center", color: SLATE });
    const obsFinal = tag
      ? tag + (r.observacion ? ` · ${r.observacion}` : "")
      : r.observacion ?? "";
    text(ctx, obsFinal.slice(0, 110), cols[6].x + 4, ctx.y - 9, { size: 8, bold: !!tag });

    // separator line
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y - 14 },
      end:   { x: A4_W - MARGIN, y: ctx.y - 14 },
      color: rgb(0.9, 0.9, 0.9), thickness: 0.3,
    });
    ctx.y -= 14;
  }

  if (filas.length === 0) {
    text(ctx, "Sin marcaciones en el rango indicado.", MARGIN + 6, ctx.y - 12, { size: 9, color: SLATE });
    ctx.y -= 24;
  }

  // Totales
  if (ctx.y < MARGIN + 60) newPage(ctx);
  ctx.y -= 10;
  const horasNormales = totalHoras - horasFeriado;
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 20, width: A4_W - MARGIN * 2, height: 20, color: FILL });
  text(ctx, `Total registros: ${filas.length}`, MARGIN + 10, ctx.y - 13, { bold: true, size: 9 });
  text(ctx, `Empleados: ${empleadosSet.size || (empleadoNombre ? 1 : 0)}`, MARGIN + 180, ctx.y - 13, { size: 9 });
  if (horasFeriado > 0) {
    text(ctx, `Horas normales: ${horasNormales.toFixed(2)}`, MARGIN + 320, ctx.y - 13, { size: 9 });
    text(ctx, `Horas feriado: ${horasFeriado.toFixed(2)}`, MARGIN + 470, ctx.y - 13, { bold: true, size: 9, color: rgb(0.85, 0.4, 0.1) });
  }
  text(ctx, `Horas totales: ${totalHoras.toFixed(2)}`, A4_W - MARGIN - 10, ctx.y - 13, { bold: true, size: 10, align: "right" });
  ctx.y -= 24;

  // Leyenda de colores (solo si se usaron)
  const feriadosEnRango = extras?.feriados?.filter((f) => f.fecha >= desde && f.fecha <= hasta) ?? [];
  const ausenciasEnRango = ausencias.filter(
    (a) => a.fecha_hasta >= desde && a.fecha_desde <= hasta && (!empleadoIdFiltro || a.empleado_id === empleadoIdFiltro)
  );
  if (feriadosEnRango.length > 0 || ausenciasEnRango.length > 0) {
    if (ctx.y < MARGIN + 30) newPage(ctx);
    text(ctx, "Días especiales del período:", MARGIN, ctx.y - 10, { bold: true, size: 8, color: SLATE });
    ctx.y -= 14;
    for (const f of feriadosEnRango) {
      if (ctx.y < MARGIN + 20) newPage(ctx);
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 10, width: 8, height: 8, color: BG_FERIADO });
      text(ctx, `${fmtFecha(f.fecha)}  Feriado: ${f.nombre}`, MARGIN + 14, ctx.y - 8, { size: 7.5 });
      ctx.y -= 11;
    }
    for (const a of ausenciasEnRango) {
      if (ctx.y < MARGIN + 20) newPage(ctx);
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 10, width: 8, height: 8, color: BG_AUSENCIA });
      const rango = a.fecha_desde === a.fecha_hasta ? fmtFecha(a.fecha_desde) : `${fmtFecha(a.fecha_desde)}–${fmtFecha(a.fecha_hasta)}`;
      const emp = (a as { empleado_nombre?: string | null }).empleado_nombre ?? "";
      text(ctx, `${rango}  ${AUSENCIA_LABEL[a.tipo]}${emp ? ` (${emp})` : ""}${a.observacion ? ` — ${a.observacion}` : ""}`, MARGIN + 14, ctx.y - 8, { size: 7.5 });
      ctx.y -= 11;
    }
  }

  // Footer
  text(ctx, `Generado el ${fmtFecha(new Date().toISOString().slice(0, 10))}`, MARGIN, MARGIN - 8, { size: 7, color: SLATE });

  return await doc.save();
}
