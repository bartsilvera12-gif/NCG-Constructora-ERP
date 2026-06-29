/**
 * Generador de PDF para el recibo de nómina (estilo recibo español).
 * pdf-lib, A4, Helvetica. Sin assets externos.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export type ReciboCabecera = {
  empresa_nombre_snapshot: string | null;
  empresa_nif_snapshot: string | null;
  empresa_inscripcion_ss_snapshot: string | null;
  empresa_cnae_snapshot: string | null;
  empresa_centro_snapshot: string | null;
  empleado_nombre_snapshot: string | null;
  empleado_nif_snapshot: string | null;
  empleado_afiliacion_snapshot: string | null;
  empleado_categoria_snapshot: string | null;
  empleado_grupo_cot_snapshot: string | null;
  empleado_puesto_snapshot: string | null;
  empleado_antiguedad_snapshot: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  total_dias: number;
  dias_cotizados: number;
  total_devengado: number;
  total_deducciones: number;
  liquido: number;
  coste_empresa: number;
};

export type ReciboDevengo = {
  concepto: string;
  cantidad: number | null;
  importe_unitario: number | null;
  importe_total: number;
  es_salarial: boolean;
  orden: number;
};

export type ReciboDeduccion = {
  tipo: "aportacion_trabajador" | "irpf" | "especie" | "aportacion_empresa";
  concepto: string;
  base: number | null;
  tipo_pct: number | null;
  importe: number;
  orden: number;
};

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 28;
const BLACK: RGB = rgb(0, 0, 0);
const GREY: RGB = rgb(0.85, 0.85, 0.85);
const LIGHT_FILL: RGB = rgb(0.95, 0.95, 0.95);

function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined) return "";
  return Number(n).toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtFecha(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtPeriodoLargo(desde: string, hasta: string): string {
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const [yD, mD, dD] = desde.split("-").map((x) => parseInt(x, 10));
  const [yH, mH, dH] = hasta.split("-").map((x) => parseInt(x, 10));
  return `${dD} de ${meses[mD - 1]} a ${dH} de ${meses[mH - 1]} de ${yH || yD}`;
}

type Ctx = {
  page: PDFPage;
  font: PDFFont;
  fontB: PDFFont;
  fontI: PDFFont;
};

function rect(page: PDFPage, x: number, y: number, w: number, h: number, fill?: RGB) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: BLACK, borderWidth: 0.5, color: fill });
}
function text(page: PDFPage, str: string, x: number, y: number, opts: { font: PDFFont; size?: number; color?: RGB } & { align?: "left" | "right" }) {
  const size = opts.size ?? 8;
  const color = opts.color ?? BLACK;
  if (opts.align === "right") {
    const w = opts.font.widthOfTextAtSize(str, size);
    page.drawText(str, { x: x - w, y, size, font: opts.font, color });
  } else {
    page.drawText(str, { x, y, size, font: opts.font, color });
  }
}

function drawCabecera(ctx: Ctx, c: ReciboCabecera, topY: number): number {
  const { page, font, fontB } = ctx;
  const w = A4_W - MARGIN * 2;
  const colW = w / 2;
  const boxH = 78;
  rect(page, MARGIN, topY - boxH, w, boxH);
  // Vertical divider
  page.drawLine({ start: { x: MARGIN + colW, y: topY }, end: { x: MARGIN + colW, y: topY - boxH }, color: BLACK, thickness: 0.5 });

  const leftLines: Array<[string, string]> = [
    ["Empresa:", c.empresa_nombre_snapshot ?? ""],
    ["N.I.F.:", c.empresa_nif_snapshot ?? ""],
    ["Inscripción S.S.:", c.empresa_inscripcion_ss_snapshot ?? ""],
    ["Centro:", c.empresa_centro_snapshot ?? ""],
  ];
  const rightLines: Array<[string, string]> = [
    ["Trabajador:", c.empleado_nombre_snapshot ?? ""],
    ["N.I.F.:", c.empleado_nif_snapshot ?? ""],
    ["Afiliación S.S.:", c.empleado_afiliacion_snapshot ?? ""],
    ["Antigüedad:", fmtFecha(c.empleado_antiguedad_snapshot)],
    ["Grupo cot.:", c.empleado_grupo_cot_snapshot ?? ""],
    ["C.N.A.E.:", c.empresa_cnae_snapshot ?? ""],
    ["Categoría:", c.empleado_categoria_snapshot ?? ""],
    ["Puesto:", c.empleado_puesto_snapshot ?? ""],
  ];

  let yL = topY - 14;
  for (const [k, v] of leftLines) {
    text(page, k, MARGIN + 6, yL, { font: fontB, size: 8 });
    text(page, v, MARGIN + 92, yL, { font, size: 8 });
    yL -= 12;
  }
  let yR = topY - 14;
  for (const [k, v] of rightLines) {
    text(page, k, MARGIN + colW + 6, yR, { font: fontB, size: 7.5 });
    text(page, v, MARGIN + colW + 80, yR, { font, size: 7.5 });
    yR -= 8.8;
  }

  // Periodo + total días / cotizados
  const periodoY = topY - boxH - 14;
  rect(page, MARGIN, periodoY, w, 14);
  text(page, "Periodo de liquidación:", MARGIN + 6, periodoY + 4, { font: fontB, size: 8 });
  text(page, `01 de ${fmtPeriodoLargo(c.periodo_desde, c.periodo_hasta).split(" a ")[0].replace(/^\d+ de /, "")} a ${c.periodo_hasta.split("-")[2]} de ${(["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"])[parseInt(c.periodo_hasta.split("-")[1], 10) - 1]} de ${c.periodo_hasta.split("-")[0]}`, MARGIN + 105, periodoY + 4, { font, size: 8 });
  text(page, "Total días", MARGIN + w - 130, periodoY + 4, { font: fontB, size: 8 });
  text(page, String(c.total_dias), MARGIN + w - 75, periodoY + 4, { font, size: 8 });
  text(page, "Cotizados", MARGIN + w - 55, periodoY + 4, { font: fontB, size: 8 });
  text(page, String(c.dias_cotizados), MARGIN + w - 12, periodoY + 4, { font, size: 8, align: "right" });

  return periodoY;
}

function drawDevengos(ctx: Ctx, devengos: ReciboDevengo[], topY: number, totalDevengado: number): number {
  const { page, font, fontB, fontI } = ctx;
  const w = A4_W - MARGIN * 2;
  // Header band
  let y = topY - 18;
  text(page, "I. DEVENGOS", MARGIN, y, { font: fontB, size: 9 });
  text(page, "Cantidad", MARGIN + 290, y, { font: fontB, size: 8 });
  text(page, "Importe", MARGIN + 380, y, { font: fontB, size: 8 });
  text(page, "Total", MARGIN + w - 12, y, { font: fontB, size: 8, align: "right" });
  page.drawLine({ start: { x: MARGIN, y: y - 3 }, end: { x: MARGIN + w, y: y - 3 }, color: BLACK, thickness: 0.5 });

  y -= 16;
  text(page, "1. Percepciones salariales", MARGIN + 6, y, { font: fontI, size: 8 });
  y -= 12;

  const salariales = devengos.filter((d) => d.es_salarial).sort((a, b) => a.orden - b.orden);
  const noSalariales = devengos.filter((d) => !d.es_salarial).sort((a, b) => a.orden - b.orden);

  for (const d of salariales) {
    text(page, d.concepto, MARGIN + 12, y, { font, size: 8 });
    text(page, fmtNum(d.cantidad ?? null, 0), MARGIN + 320, y, { font, size: 8, align: "right" });
    text(page, fmtNum(d.importe_unitario ?? null, 2), MARGIN + 410, y, { font, size: 8, align: "right" });
    text(page, fmtMoney(d.importe_total), MARGIN + w - 12, y, { font, size: 8, align: "right" });
    y -= 11;
  }
  if (noSalariales.length > 0) {
    y -= 4;
    text(page, "2. Percepciones no salariales", MARGIN + 6, y, { font: fontI, size: 8 });
    y -= 12;
    for (const d of noSalariales) {
      text(page, d.concepto, MARGIN + 12, y, { font, size: 8 });
      text(page, fmtNum(d.cantidad ?? null, 0), MARGIN + 320, y, { font, size: 8, align: "right" });
      text(page, fmtNum(d.importe_unitario ?? null, 2), MARGIN + 410, y, { font, size: 8, align: "right" });
      text(page, fmtMoney(d.importe_total), MARGIN + w - 12, y, { font, size: 8, align: "right" });
      y -= 11;
    }
  }

  // Total devengado box
  y -= 8;
  const boxY = y - 14;
  rect(page, MARGIN + 270, boxY, w - 270, 16, LIGHT_FILL);
  text(page, "TOTAL DEVENGADO:", MARGIN + 278, boxY + 4, { font: fontB, size: 9 });
  text(page, fmtMoney(totalDevengado), MARGIN + w - 12, boxY + 4, { font: fontB, size: 9, align: "right" });
  return boxY;
}

function drawDeducciones(ctx: Ctx, deducciones: ReciboDeduccion[], topY: number, totalDeducciones: number, liquido: number): number {
  const { page, font, fontB, fontI } = ctx;
  const w = A4_W - MARGIN * 2;
  let y = topY - 18;

  text(page, "II. DEDUCCIONES", MARGIN, y, { font: fontB, size: 9 });
  page.drawLine({ start: { x: MARGIN, y: y - 3 }, end: { x: MARGIN + w, y: y - 3 }, color: BLACK, thickness: 0.5 });

  const trab = deducciones.filter((d) => d.tipo === "aportacion_trabajador").sort((a, b) => a.orden - b.orden);
  const irpf = deducciones.filter((d) => d.tipo === "irpf").sort((a, b) => a.orden - b.orden);
  const esp = deducciones.filter((d) => d.tipo === "especie").sort((a, b) => a.orden - b.orden);

  y -= 16;
  text(page, "1. Aportación del trabajador a las cotizaciones a la Seg. Social y conceptos de la recaudación conjunta.", MARGIN + 6, y, { font: fontI, size: 7.5 });
  y -= 12;
  text(page, "Concepto", MARGIN + 12, y, { font: fontB, size: 7.5 });
  text(page, "Base", MARGIN + 250, y, { font: fontB, size: 7.5, align: "right" });
  text(page, "%", MARGIN + 290, y, { font: fontB, size: 7.5, align: "right" });
  text(page, "Importe", MARGIN + 360, y, { font: fontB, size: 7.5, align: "right" });
  y -= 10;
  let totalAport = 0;
  for (const d of trab) {
    text(page, d.concepto, MARGIN + 12, y, { font, size: 8 });
    text(page, fmtNum(d.base ?? null, 2), MARGIN + 250, y, { font, size: 8, align: "right" });
    text(page, fmtNum(d.tipo_pct ?? null, 2), MARGIN + 290, y, { font, size: 8, align: "right" });
    text(page, fmtMoney(d.importe), MARGIN + 360, y, { font, size: 8, align: "right" });
    totalAport += Number(d.importe) || 0;
    y -= 11;
  }
  text(page, "TOTAL APORTACIONES", MARGIN + 12, y, { font: fontB, size: 8 });
  text(page, fmtMoney(totalAport), MARGIN + 360, y, { font: fontB, size: 8, align: "right" });
  y -= 14;

  if (irpf.length > 0) {
    text(page, "2. Impuesto sobre la Renta de las Personas Físicas", MARGIN + 6, y, { font: fontI, size: 8 });
    y -= 11;
    for (const d of irpf) {
      text(page, d.concepto, MARGIN + 12, y, { font, size: 8 });
      text(page, fmtNum(d.base ?? null, 2), MARGIN + 250, y, { font, size: 8, align: "right" });
      text(page, fmtNum(d.tipo_pct ?? null, 2), MARGIN + 290, y, { font, size: 8, align: "right" });
      text(page, fmtMoney(d.importe), MARGIN + 360, y, { font, size: 8, align: "right" });
      y -= 11;
    }
    y -= 4;
  }
  if (esp.length > 0) {
    text(page, "3. Valor de los productos recibidos en especie", MARGIN + 6, y, { font: fontI, size: 8 });
    y -= 11;
    for (const d of esp) {
      text(page, d.concepto, MARGIN + 12, y, { font, size: 8 });
      text(page, fmtMoney(d.importe), MARGIN + 360, y, { font, size: 8, align: "right" });
      y -= 11;
    }
    y -= 4;
  }

  // Total a deducir + líquido
  y -= 4;
  rect(page, MARGIN + 270, y - 14, w - 270, 16, LIGHT_FILL);
  text(page, "TOTAL A DEDUCIR:", MARGIN + 278, y - 10, { font: fontB, size: 9 });
  text(page, fmtMoney(totalDeducciones), MARGIN + w - 12, y - 10, { font: fontB, size: 9, align: "right" });
  y -= 18;
  rect(page, MARGIN + 270, y - 14, w - 270, 16, rgb(0.9, 0.96, 0.96));
  text(page, "TOTAL LIQUIDO A PERCIBIR:", MARGIN + 278, y - 10, { font: fontB, size: 10 });
  text(page, fmtMoney(liquido), MARGIN + w - 12, y - 10, { font: fontB, size: 10, align: "right" });
  return y - 18;
}

function drawBases(ctx: Ctx, deducciones: ReciboDeduccion[], topY: number, costeEmpresa: number, totalDevengado: number, periodoHasta: string): number {
  const { page, font, fontB } = ctx;
  const w = A4_W - MARGIN * 2;
  let y = topY - 14;

  rect(page, MARGIN, y - 28, w, 28, LIGHT_FILL);
  text(page, "DETERMINACION DE LAS BASES DE COTIZACION A LA SEGURIDAD SOCIAL Y CONCEPTOS DE RECAUDACION CONJUNTA Y DE LA BASE SUJETA", MARGIN + 6, y - 10, { font: fontB, size: 7 });
  text(page, "A RETENCION DEL I.R.P.F. Y APORTACIÓN DE LA EMPRESA", MARGIN + 6, y - 20, { font: fontB, size: 7 });
  y -= 32;

  // Tabla
  rect(page, MARGIN, y - 12, w, 12, LIGHT_FILL);
  text(page, "CONCEPTO", MARGIN + 6, y - 8, { font: fontB, size: 8 });
  text(page, "BASE", MARGIN + 290, y - 8, { font: fontB, size: 8, align: "right" });
  text(page, "TIPO", MARGIN + 340, y - 8, { font: fontB, size: 8, align: "right" });
  text(page, "APORTACIÓN EMPRESA", MARGIN + w - 12, y - 8, { font: fontB, size: 8, align: "right" });
  y -= 14;

  const aportEmpresa = deducciones.filter((d) => d.tipo === "aportacion_empresa").sort((a, b) => a.orden - b.orden);
  for (const d of aportEmpresa) {
    text(page, d.concepto, MARGIN + 6, y - 8, { font, size: 8 });
    text(page, fmtNum(d.base ?? null, 2), MARGIN + 290, y - 8, { font, size: 8, align: "right" });
    text(page, fmtNum(d.tipo_pct ?? null, 2), MARGIN + 340, y - 8, { font, size: 8, align: "right" });
    text(page, fmtMoney(d.importe), MARGIN + w - 12, y - 8, { font, size: 8, align: "right" });
    y -= 11;
  }

  // Coste empresa
  y -= 8;
  rect(page, MARGIN + 270, y - 14, w - 270, 16, LIGHT_FILL);
  text(page, "Coste empresa", MARGIN + 278, y - 10, { font: fontB, size: 9 });
  text(page, fmtMoney(costeEmpresa), MARGIN + w - 12, y - 10, { font: fontB, size: 9, align: "right" });
  y -= 24;

  // Firma + fecha
  text(page, "Firma y Sello de la Empresa", MARGIN + 20, y, { font, size: 8 });
  text(page, `${fmtFecha(periodoHasta)}`, MARGIN + 280, y, { font, size: 8 });
  text(page, "Recibí", MARGIN + 280, y - 10, { font, size: 8 });

  return y - 30;
}

export async function buildReciboPdf(
  cab: ReciboCabecera,
  devengos: ReciboDevengo[],
  deducciones: ReciboDeduccion[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([A4_W, A4_H]);
  const ctx: Ctx = { page, font, fontB, fontI };

  let y = A4_H - MARGIN;
  y = drawCabecera(ctx, cab, y);
  y = drawDevengos(ctx, devengos, y, cab.total_devengado);
  y = drawDeducciones(ctx, deducciones, y, cab.total_deducciones, cab.liquido);
  y = drawBases(ctx, deducciones, y, cab.coste_empresa, cab.total_devengado, cab.periodo_hasta);

  // Footer
  text(page, "EJEMPLAR PARA LA EMPRESA", MARGIN, MARGIN, { font, size: 7 });

  return await doc.save();
}
