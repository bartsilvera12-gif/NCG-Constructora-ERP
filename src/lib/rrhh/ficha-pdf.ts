/**
 * Generador de PDF para la ficha del empleado.
 * pdf-lib, A4, Helvetica. Sin assets externos.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export type FichaEmpresa = {
  nombre: string | null;
  nif: string | null;
  inscripcion_ss: string | null;
  cnae: string | null;
  centro_trabajo_direccion: string | null;
};

export type FichaEmpleado = {
  nombre: string;
  tipo_documento: string | null;
  documento: string | null;
  fecha_nacimiento: string | null;
  lugar_nacimiento: string | null;
  nacionalidad: string | null;
  estado_civil: string | null;
  grupo_sanguineo: string | null;
  direccion: string | null;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  fecha_ingreso: string | null;
  fecha_baja: string | null;
  tipo_empleado: string | null;
  tipo_periodo: string | null;
  tipos_empleado: string[] | null;
  sucursal: string | null;
  departamento: string | null;
  seccion: string | null;
  supervisor: string | null;
  afiliacion_ss: string | null;
  grupo_cotizacion: string | null;
  categoria_nivel: string | null;
  salario_base: number;
  salario_complementario: number;
  costo_hora: number;
  banco: string | null;
  numero_cuenta: string | null;
  cobrar_con_cheque: boolean;
  chofer_habilitacion: string | null;
  chofer_fecha_venc: string | null;
  chofer_km: number | null;
  chofer_observacion: string | null;
  participa_comisiones: boolean | null;
  comision_observacion: string | null;
  excluir_liquidaciones: boolean;
  activo: boolean;
  estado: string | null;
  tipo_contrato: string | null;
  jornada_laboral: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  contacto_emergencia_parentesco: string | null;
  observaciones: string | null;
};

export type FichaExtras = {
  especialidades?: Array<{ nombre: string; es_principal: boolean; nivel: string | null }>;
  salarioVigente?: {
    fecha_desde: string; fecha_hasta: string | null;
    salario_bruto: number; salario_neto: number | null;
    plus_peligrosidad: number; plus_prl: number;
    coste_empresa: number | null; moneda: string;
  } | null;
  mostrarSalario?: boolean;
  cursos?: Array<{
    nombre: string; tipo: string;
    entidad_emisora: string | null;
    fecha_emision: string | null; fecha_vencimiento: string | null;
    estado: "vigente" | "por_vencer" | "vencido" | "pendiente";
  }>;
  obraActual?: {
    proyecto_nombre: string | null;
    fecha_desde: string | null;
    fecha_hasta_estimada: string | null;
  } | null;
};

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 40;
const CONTENT_W = A4_W - MARGIN * 2;

// Paleta
const INK: RGB = rgb(0.09, 0.13, 0.18);       // slate-900
const MUTED: RGB = rgb(0.42, 0.47, 0.55);     // slate-500
const HAIRLINE: RGB = rgb(0.88, 0.9, 0.93);   // slate-200
const ACCENT: RGB = rgb(0.31, 0.68, 0.7);     // #4FAEB2
const ACCENT_SOFT: RGB = rgb(0.9, 0.96, 0.96); // teal-50
const OK_SOFT: RGB = rgb(0.87, 0.96, 0.9);
const OK_INK: RGB = rgb(0.11, 0.55, 0.31);
const WARN_SOFT: RGB = rgb(0.99, 0.93, 0.83);
const WARN_INK: RGB = rgb(0.72, 0.42, 0.05);
const DANGER_SOFT: RGB = rgb(0.99, 0.9, 0.9);
const DANGER_INK: RGB = rgb(0.72, 0.11, 0.15);
const WHITE: RGB = rgb(1, 1, 1);

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
function v(s: string | null | undefined): string {
  if (s === null || s === undefined) return "—";
  const t = String(s).trim();
  return t.length === 0 ? "—" : t;
}
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontB: PDFFont;
  y: number;
  pagina: number;
};

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([A4_W, A4_H]);
  ctx.y = A4_H - MARGIN;
  ctx.pagina += 1;
  footer(ctx);
}
function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 24) newPage(ctx);
}
function text(ctx: Ctx, str: string, x: number, y: number, opts: { bold?: boolean; size?: number; color?: RGB; align?: "left" | "right" | "center"; maxWidth?: number } = {}) {
  const size = opts.size ?? 9;
  const font = opts.bold ? ctx.fontB : ctx.font;
  const color = opts.color ?? INK;
  let s = str;
  if (opts.maxWidth) {
    while (s.length > 0 && font.widthOfTextAtSize(s, size) > opts.maxWidth) s = s.slice(0, -1);
    if (s.length < str.length) s = s.slice(0, Math.max(0, s.length - 1)) + "…";
  }
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
function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: RGB, radius = 0) {
  if (radius === 0) {
    ctx.page.drawRectangle({ x, y, width: w, height: h, color });
    return;
  }
  // Aproximación redondeada con dos rectángulos + 4 esquinas circulares (pdf-lib no tiene rounded rect nativo).
  ctx.page.drawRectangle({ x: x + radius, y, width: w - radius * 2, height: h, color });
  ctx.page.drawRectangle({ x, y: y + radius, width: w, height: h - radius * 2, color });
  ctx.page.drawCircle({ x: x + radius, y: y + radius, size: radius, color });
  ctx.page.drawCircle({ x: x + w - radius, y: y + radius, size: radius, color });
  ctx.page.drawCircle({ x: x + radius, y: y + h - radius, size: radius, color });
  ctx.page.drawCircle({ x: x + w - radius, y: y + h - radius, size: radius, color });
}
function hairline(ctx: Ctx, x1: number, y: number, x2: number) {
  ctx.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color: HAIRLINE, thickness: 0.5 });
}

// ── Header profesional ──────────────────────────────────────────────────────

function header(ctx: Ctx, empresa: FichaEmpresa, e: FichaEmpleado) {
  const w = CONTENT_W;
  const h = 90;
  const yTop = ctx.y;

  // Banda de fondo blanca con borde inferior teal.
  rect(ctx, MARGIN, yTop - h, w, h, WHITE);
  ctx.page.drawLine({
    start: { x: MARGIN, y: yTop - h },
    end: { x: MARGIN + w, y: yTop - h },
    color: ACCENT,
    thickness: 2,
  });

  // Avatar circular con iniciales (izquierda).
  const cx = MARGIN + 32;
  const cy = yTop - 32;
  ctx.page.drawCircle({ x: cx, y: cy, size: 22, color: ACCENT_SOFT });
  ctx.page.drawCircle({ x: cx, y: cy, size: 22, borderColor: ACCENT, borderWidth: 1 });
  text(ctx, iniciales(e.nombre), cx, cy - 5, { bold: true, size: 15, color: ACCENT, align: "center" });

  // Nombre + subtítulo empresa.
  const xText = MARGIN + 70;
  text(ctx, e.nombre.toUpperCase(), xText, yTop - 22, { bold: true, size: 16, color: INK, maxWidth: w - 240 });
  const subtitulo = [v(e.cargo), v(empresa.nombre)].filter((s) => s !== "—").join(" · ");
  text(ctx, subtitulo || "Ficha del empleado", xText, yTop - 36, { size: 9, color: MUTED, maxWidth: w - 240 });

  // Micro-metadata: DNI, ingreso, obra.
  const meta: string[] = [];
  if (e.documento) meta.push(`${e.tipo_documento ?? "Doc"}: ${e.documento}`);
  if (e.fecha_ingreso) meta.push(`Ingreso: ${fmtFecha(e.fecha_ingreso)}`);
  text(ctx, meta.join("   ·   "), xText, yTop - 52, { size: 8, color: MUTED });

  // Badge de estado (derecha).
  const estado = (e.estado ?? (e.activo ? "activo" : "baja")).toLowerCase();
  const badgeMap: Record<string, { bg: RGB; ink: RGB; label: string }> = {
    activo:     { bg: OK_SOFT,    ink: OK_INK,    label: "ACTIVO"     },
    pendiente:  { bg: ACCENT_SOFT, ink: ACCENT,   label: "PENDIENTE"  },
    suspendido: { bg: WARN_SOFT,  ink: WARN_INK,  label: "SUSPENDIDO" },
    baja:       { bg: DANGER_SOFT, ink: DANGER_INK, label: "BAJA"     },
  };
  const badge = badgeMap[estado] ?? badgeMap.activo;
  const bLabel = badge.label;
  const bW = ctx.fontB.widthOfTextAtSize(bLabel, 9) + 24;
  const bH = 22;
  const bx = MARGIN + w - bW - 12;
  const by = yTop - 34;
  rect(ctx, bx, by, bW, bH, badge.bg, 11);
  text(ctx, bLabel, bx + bW / 2, by + 7, { bold: true, size: 9, color: badge.ink, align: "center" });

  // Sub-info bajo el badge: excluido de liquidaciones, comisiones.
  const flags: string[] = [];
  if (e.excluir_liquidaciones) flags.push("Excluido de nómina");
  if (e.participa_comisiones) flags.push("Comisiones");
  if (flags.length > 0) {
    text(ctx, flags.join(" · "), MARGIN + w - 12, by - 8, { size: 7, color: MUTED, align: "right" });
  }

  ctx.y -= h + 12;
}

// ── Section header (título con acento) ──────────────────────────────────────

function seccion(ctx: Ctx, titulo: string) {
  ensureSpace(ctx, 26);
  // Barra vertical de acento a la izquierda + título.
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 12, width: 3, height: 12, color: ACCENT });
  text(ctx, titulo.toUpperCase(), MARGIN + 10, ctx.y - 10, { bold: true, size: 9, color: INK });
  ctx.y -= 16;
  hairline(ctx, MARGIN, ctx.y, MARGIN + CONTENT_W);
  ctx.y -= 8;
}

// ── Grid de campos con espaciado limpio ─────────────────────────────────────

function campos(ctx: Ctx, items: Array<[string, string]>, cols = 2) {
  const colW = CONTENT_W / cols;
  const rowH = 22;
  const rows = Math.ceil(items.length / cols);
  ensureSpace(ctx, rows * rowH + 4);

  for (let i = 0; i < items.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * colW;
    const y = ctx.y - row * rowH;
    const [label, value] = items[i];
    text(ctx, label.toUpperCase(), x, y, { size: 6.5, color: MUTED });
    text(ctx, value, x, y - 12, { size: 10, color: INK, maxWidth: colW - 12 });
  }
  ctx.y -= rows * rowH + 6;
}

// ── Chips (para tipos_empleado, especialidades) ────────────────────────────

function chips(ctx: Ctx, items: string[]) {
  if (items.length === 0) return;
  ensureSpace(ctx, 22);
  let x = MARGIN;
  const y = ctx.y - 12;
  for (const raw of items) {
    const label = raw.trim();
    if (!label) continue;
    const w = ctx.fontB.widthOfTextAtSize(label, 8) + 16;
    if (x + w > MARGIN + CONTENT_W) {
      ctx.y -= 18;
      x = MARGIN;
    }
    rect(ctx, x, ctx.y - 15, w, 14, ACCENT_SOFT, 7);
    text(ctx, label, x + w / 2, ctx.y - 11, { bold: true, size: 8, color: ACCENT, align: "center" });
    x += w + 6;
  }
  ctx.y -= 20;
}

function footer(ctx: Ctx) {
  const y = MARGIN - 12;
  hairline(ctx, MARGIN, y + 10, MARGIN + CONTENT_W);
  text(ctx, `Generado el ${fmtFecha(new Date().toISOString().slice(0, 10))}`, MARGIN, y, { size: 7, color: MUTED });
  text(ctx, `Página ${ctx.pagina}`, MARGIN + CONTENT_W, y, { size: 7, color: MUTED, align: "right" });
}

// ── Documento principal ─────────────────────────────────────────────────────

export async function buildFichaPdf(empresa: FichaEmpresa, e: FichaEmpleado, extras: FichaExtras = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4_W, A4_H]);
  const ctx: Ctx = { doc, page, font, fontB, y: A4_H - MARGIN, pagina: 1 };
  footer(ctx);

  header(ctx, empresa, e);

  // Identificación (arriba del todo, es lo primero que se busca)
  seccion(ctx, "Identificación");
  campos(ctx, [
    ["Tipo documento", v(e.tipo_documento)],
    ["Nº documento", v(e.documento)],
    ["Nacionalidad", v(e.nacionalidad)],
    ["Estado civil", v(e.estado_civil)],
    ["Fecha nacimiento", fmtFecha(e.fecha_nacimiento)],
    ["Lugar nacimiento", v(e.lugar_nacimiento)],
    ["Grupo sanguíneo", v(e.grupo_sanguineo)],
    ["Afiliación S.S.", v(e.afiliacion_ss)],
  ], 2);

  // Contacto
  seccion(ctx, "Contacto");
  campos(ctx, [
    ["Teléfono", v(e.telefono)],
    ["Email", v(e.email)],
    ["Dirección", v(e.direccion)],
  ], 2);

  // Contacto de emergencia
  if (e.contacto_emergencia_nombre || e.contacto_emergencia_telefono) {
    seccion(ctx, "Contacto de emergencia");
    campos(ctx, [
      ["Nombre", v(e.contacto_emergencia_nombre)],
      ["Teléfono", v(e.contacto_emergencia_telefono)],
      ["Parentesco", v(e.contacto_emergencia_parentesco)],
    ], 3);
  }

  // Puesto y contrato (fusionado, más denso y visual)
  seccion(ctx, "Puesto y contrato");
  campos(ctx, [
    ["Cargo / Puesto", v(e.cargo)],
    ["Categoría / Nivel", v(e.categoria_nivel)],
    ["Tipo de contrato", v(e.tipo_contrato)],
    ["Jornada laboral", v(e.jornada_laboral)],
    ["Tipo de empleado", v(e.tipo_empleado)],
    ["Tipo de periodo", v(e.tipo_periodo)],
    ["Fecha ingreso", fmtFecha(e.fecha_ingreso)],
    ["Fecha baja", fmtFecha(e.fecha_baja)],
    ["Grupo cotización", v(e.grupo_cotizacion)],
    ["Estado", v(e.estado)],
  ], 2);

  // Roles / tipos_empleado (chips) si existe
  if (e.tipos_empleado && e.tipos_empleado.length > 0) {
    seccion(ctx, "Roles");
    chips(ctx, e.tipos_empleado);
  }

  // Organización
  seccion(ctx, "Organización");
  campos(ctx, [
    ["Sucursal", v(e.sucursal)],
    ["Departamento", v(e.departamento)],
    ["Sección / Equipo", v(e.seccion)],
    ["Supervisor", v(e.supervisor)],
  ], 2);

  // Especialidades
  if (extras.especialidades && extras.especialidades.length > 0) {
    seccion(ctx, "Especialidades");
    const items: Array<[string, string]> = extras.especialidades.map((esp) => [
      esp.es_principal ? `${esp.nombre} (principal)` : esp.nombre,
      v(esp.nivel),
    ]);
    campos(ctx, items, 2);
  }

  // Obra actual
  if (extras.obraActual && extras.obraActual.proyecto_nombre) {
    seccion(ctx, "Obra asignada actual");
    campos(ctx, [
      ["Proyecto", v(extras.obraActual.proyecto_nombre)],
      ["Desde", fmtFecha(extras.obraActual.fecha_desde)],
      ["Hasta estimada", fmtFecha(extras.obraActual.fecha_hasta_estimada)],
    ], 3);
  }

  // Compensación
  if (extras.mostrarSalario) {
    seccion(ctx, "Compensación");
    if (extras.salarioVigente) {
      const s = extras.salarioVigente;
      campos(ctx, [
        ["Salario bruto (vigente)", fmtMoney(s.salario_bruto)],
        ["Salario neto", fmtMoney(s.salario_neto)],
        ["Plus peligrosidad", fmtMoney(s.plus_peligrosidad)],
        ["Plus PRL", fmtMoney(s.plus_prl)],
        ["Coste empresa", fmtMoney(s.coste_empresa)],
        ["Moneda", v(s.moneda)],
      ], 2);
      text(ctx, `Vigencia: ${fmtFecha(s.fecha_desde)} — ${s.fecha_hasta ? fmtFecha(s.fecha_hasta) : "indefinida"}`, MARGIN, ctx.y, { size: 8, color: MUTED });
      ctx.y -= 14;
    } else {
      campos(ctx, [
        ["Salario base", fmtMoney(e.salario_base)],
        ["Complementario", fmtMoney(e.salario_complementario)],
        ["Costo por hora", fmtMoney(e.costo_hora)],
        ["Excluido de nómina", e.excluir_liquidaciones ? "Sí" : "No"],
      ], 2);
    }
  }

  // Cursos y certificados
  if (extras.cursos && extras.cursos.length > 0) {
    seccion(ctx, "Cursos y certificados");
    for (const c of extras.cursos) {
      ensureSpace(ctx, 18);
      const estadoLabel =
        c.estado === "vencido"    ? "VENCIDO" :
        c.estado === "por_vencer" ? "POR VENCER" :
        c.estado === "vigente"    ? "VIGENTE" : "PENDIENTE";
      const estadoColor =
        c.estado === "vencido"    ? DANGER_INK :
        c.estado === "por_vencer" ? WARN_INK :
        c.estado === "vigente"    ? OK_INK : MUTED;
      text(ctx, c.nombre, MARGIN, ctx.y, { bold: true, size: 9.5, maxWidth: CONTENT_W - 200 });
      const venceText = c.fecha_vencimiento ? `vence ${fmtFecha(c.fecha_vencimiento)}` : "sin fecha";
      text(ctx, venceText, MARGIN + CONTENT_W - 60, ctx.y, { size: 8, color: MUTED, align: "right" });
      text(ctx, estadoLabel, MARGIN + CONTENT_W, ctx.y, { bold: true, size: 8, color: estadoColor, align: "right" });
      ctx.y -= 16;
    }
    ctx.y -= 2;
  }

  // Datos bancarios
  seccion(ctx, "Datos bancarios");
  campos(ctx, [
    ["Banco", v(e.banco)],
    ["Número de cuenta", v(e.numero_cuenta)],
    ["Forma de cobro", e.cobrar_con_cheque ? "Cheque" : "Transferencia"],
  ], 2);

  // Chofer
  if (e.chofer_habilitacion || e.chofer_fecha_venc || e.chofer_km) {
    seccion(ctx, "Habilitación de chofer");
    campos(ctx, [
      ["Habilitación", v(e.chofer_habilitacion)],
      ["Vencimiento", fmtFecha(e.chofer_fecha_venc)],
      ["Kilometraje", e.chofer_km !== null ? String(e.chofer_km) + " km" : "—"],
      ["Observación", v(e.chofer_observacion)],
    ], 2);
  }

  // Comisiones
  if (e.participa_comisiones && e.comision_observacion) {
    seccion(ctx, "Comisiones");
    text(ctx, e.comision_observacion, MARGIN, ctx.y, { size: 9, color: INK, maxWidth: CONTENT_W });
    ctx.y -= 14;
  }

  // Observaciones internas
  if (e.observaciones) {
    seccion(ctx, "Observaciones internas");
    ensureSpace(ctx, 40);
    // Simple line breaks (mantengo tal cual, sin word-wrap avanzado).
    const lineas = e.observaciones.split(/\n/);
    for (const l of lineas) {
      ensureSpace(ctx, 12);
      text(ctx, l, MARGIN, ctx.y, { size: 8.5, color: INK, maxWidth: CONTENT_W });
      ctx.y -= 12;
    }
    ctx.y -= 4;
  }

  // Empresa empleadora al final (contexto, menos importante que el empleado)
  seccion(ctx, "Empresa empleadora");
  campos(ctx, [
    ["Empresa", v(empresa.nombre)],
    ["N.I.F.", v(empresa.nif)],
    ["Inscripción S.S.", v(empresa.inscripcion_ss)],
    ["C.N.A.E.", v(empresa.cnae)],
    ["Centro de trabajo", v(empresa.centro_trabajo_direccion)],
  ], 2);

  return await doc.save();
}
