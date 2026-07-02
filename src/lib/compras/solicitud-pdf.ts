/**
 * Hoja de compra imprimible — Fase I.
 * pdf-lib, A4 vertical. Cabecera + tabla de items + firma / sello.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export type SolicitudCab = {
  numero: string;
  fecha: string;
  estado: string;
  observaciones: string | null;
  empresa_nombre_snapshot: string | null;
  empresa_nif_snapshot: string | null;
  proyecto_nombre_snapshot: string | null;
  empleado_nombre_snapshot: string | null;
  proveedor_nombre_snapshot: string | null;
  total_estimado: number;
};
export type SolicitudItem = {
  orden: number;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  precio_estimado: number | null;
  observaciones: string | null;
};

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 36;
const BLACK: RGB = rgb(0, 0, 0);
const SLATE: RGB = rgb(0.35, 0.4, 0.46);
const ACCENT: RGB = rgb(0.31, 0.68, 0.7);
const FILL: RGB = rgb(0.95, 0.97, 0.97);

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `€ ${(Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function v(s: string | null | undefined): string { return s && String(s).trim().length > 0 ? String(s) : "—"; }

type Ctx = { doc: PDFDocument; page: PDFPage; font: PDFFont; fontB: PDFFont; y: number };

function text(ctx: Ctx, s: string, x: number, y: number, opts: { bold?: boolean; size?: number; color?: RGB; align?: "left"|"right"|"center" } = {}) {
  const size = opts.size ?? 9;
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

export async function buildSolicitudCompraPdf(cab: SolicitudCab, items: SolicitudItem[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4_W, A4_H]);
  const ctx: Ctx = { doc, page, font, fontB, y: A4_H - MARGIN };

  // Banda superior
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 42, width: A4_W - MARGIN * 2, height: 42, color: ACCENT });
  text(ctx, "HOJA DE COMPRA", MARGIN + 14, ctx.y - 18, { bold: true, size: 14, color: rgb(1, 1, 1) });
  text(ctx, v(cab.empresa_nombre_snapshot), MARGIN + 14, ctx.y - 34, { size: 9, color: rgb(1, 1, 1) });
  text(ctx, cab.numero, A4_W - MARGIN - 14, ctx.y - 18, { bold: true, size: 12, color: rgb(1, 1, 1), align: "right" });
  text(ctx, fmtFecha(cab.fecha), A4_W - MARGIN - 14, ctx.y - 34, { size: 9, color: rgb(1, 1, 1), align: "right" });
  ctx.y -= 56;

  // Cabecera de datos
  const colW = (A4_W - MARGIN * 2) / 2;
  const drawKv = (label: string, value: string, x: number, y: number) => {
    text(ctx, label, x, y, { size: 7, color: SLATE });
    text(ctx, value, x, y - 10, { size: 9 });
  };
  drawKv("Empresa", v(cab.empresa_nombre_snapshot), MARGIN, ctx.y);
  drawKv("N.I.F.", v(cab.empresa_nif_snapshot), MARGIN + colW, ctx.y);
  ctx.y -= 24;
  drawKv("Obra / Proyecto", v(cab.proyecto_nombre_snapshot), MARGIN, ctx.y);
  drawKv("Empleado autorizado", v(cab.empleado_nombre_snapshot), MARGIN + colW, ctx.y);
  ctx.y -= 24;
  drawKv("Proveedor sugerido", v(cab.proveedor_nombre_snapshot), MARGIN, ctx.y);
  drawKv("Estado", v(cab.estado), MARGIN + colW, ctx.y);
  ctx.y -= 22;

  // Tabla de items
  const cols = [
    { label: "#",           x: MARGIN,        w: 26,  align: "center" as const },
    { label: "Descripción", x: MARGIN + 28,   w: 260 },
    { label: "Cant.",       x: MARGIN + 292,  w: 45,  align: "right" as const },
    { label: "Un.",         x: MARGIN + 340,  w: 40,  align: "left" as const },
    { label: "Precio est.", x: MARGIN + 382,  w: 65,  align: "right" as const },
    { label: "Subtotal",    x: MARGIN + 450,  w: 73,  align: "right" as const },
  ];
  const drawHeader = () => {
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 16, width: A4_W - MARGIN * 2, height: 16, color: FILL });
    for (const c of cols) {
      const tx = c.align === "right" ? c.x + c.w - 4 : c.align === "center" ? c.x + c.w / 2 : c.x + 4;
      text(ctx, c.label, tx, ctx.y - 11, { bold: true, size: 8, align: c.align });
    }
    ctx.y -= 18;
  };
  drawHeader();

  for (const it of items) {
    if (ctx.y < MARGIN + 100) {
      ctx.page = doc.addPage([A4_W, A4_H]);
      ctx.y = A4_H - MARGIN;
      drawHeader();
    }
    const subtotal = (Number(it.cantidad) || 0) * (Number(it.precio_estimado) || 0);
    text(ctx, String(it.orden + 1), cols[0].x + cols[0].w / 2, ctx.y - 10, { size: 8, align: "center" });
    text(ctx, it.descripcion.slice(0, 90), cols[1].x + 4, ctx.y - 10, { size: 8 });
    text(ctx, String(it.cantidad), cols[2].x + cols[2].w - 4, ctx.y - 10, { size: 8, align: "right" });
    text(ctx, it.unidad ?? "—", cols[3].x + 4, ctx.y - 10, { size: 8 });
    text(ctx, it.precio_estimado !== null ? fmtMoney(it.precio_estimado) : "—", cols[4].x + cols[4].w - 4, ctx.y - 10, { size: 8, align: "right" });
    text(ctx, subtotal ? fmtMoney(subtotal) : "—", cols[5].x + cols[5].w - 4, ctx.y - 10, { size: 8, align: "right" });
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y - 14 }, end: { x: A4_W - MARGIN, y: ctx.y - 14 }, color: rgb(0.9, 0.9, 0.9), thickness: 0.3 });
    ctx.y -= 14;
    if (it.observaciones) {
      text(ctx, `  · ${it.observaciones.slice(0, 110)}`, cols[1].x + 4, ctx.y - 8, { size: 7, color: SLATE });
      ctx.y -= 10;
    }
  }

  if (items.length === 0) {
    text(ctx, "Sin ítems.", MARGIN + 4, ctx.y - 12, { size: 9, color: SLATE });
    ctx.y -= 22;
  }

  // Total estimado
  ctx.y -= 6;
  ctx.page.drawRectangle({ x: MARGIN + 300, y: ctx.y - 20, width: A4_W - MARGIN - (MARGIN + 300), height: 20, color: FILL });
  text(ctx, "Total estimado:", MARGIN + 310, ctx.y - 13, { bold: true, size: 10 });
  text(ctx, fmtMoney(cab.total_estimado), A4_W - MARGIN - 10, ctx.y - 13, { bold: true, size: 11, align: "right" });
  ctx.y -= 32;

  // Observaciones
  if (cab.observaciones) {
    text(ctx, "Observaciones", MARGIN, ctx.y, { bold: true, size: 8, color: SLATE });
    text(ctx, cab.observaciones, MARGIN, ctx.y - 12, { size: 8 });
    ctx.y -= 30;
  }

  // Firma y sello
  if (ctx.y < MARGIN + 120) {
    ctx.page = doc.addPage([A4_W, A4_H]);
    ctx.y = A4_H - MARGIN;
  }
  ctx.y -= 40;
  const boxW = (A4_W - MARGIN * 2 - 20) / 2;
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 70, width: boxW, height: 70, borderColor: BLACK, borderWidth: 0.5 });
  text(ctx, "Firma empleado autorizado", MARGIN + 8, ctx.y - 60, { size: 8, color: SLATE });
  ctx.page.drawRectangle({ x: MARGIN + boxW + 20, y: ctx.y - 70, width: boxW, height: 70, borderColor: BLACK, borderWidth: 0.5 });
  text(ctx, "Sello / firma proveedor", MARGIN + boxW + 28, ctx.y - 60, { size: 8, color: SLATE });

  // Footer
  text(ctx, `Generado el ${fmtFecha(new Date().toISOString().slice(0, 10))}`, MARGIN, MARGIN - 6, { size: 7, color: SLATE });

  return await doc.save();
}
