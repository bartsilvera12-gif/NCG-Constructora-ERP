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
  // Fase A · extendidos
  estado: string | null;
  tipo_contrato: string | null;
  jornada_laboral: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  contacto_emergencia_parentesco: string | null;
  observaciones: string | null;
};

/** Extras opcionales que el endpoint de PDF carga si hay permisos/datos. */
export type FichaExtras = {
  especialidades?: Array<{ nombre: string; es_principal: boolean; nivel: string | null }>;
  salarioVigente?: {
    fecha_desde: string; fecha_hasta: string | null;
    salario_bruto: number; salario_neto: number | null;
    plus_peligrosidad: number; plus_prl: number;
    coste_empresa: number | null; moneda: string;
  } | null;
  /** Si null → el usuario no tiene permiso `salarios.ver` (se oculta la sección). */
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
const MARGIN = 36;
const BLACK: RGB = rgb(0, 0, 0);
const SLATE: RGB = rgb(0.35, 0.4, 0.46);
const ACCENT: RGB = rgb(0.31, 0.68, 0.7); // #4FAEB2
const LIGHT_FILL: RGB = rgb(0.94, 0.96, 0.96);

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

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontB: PDFFont;
  y: number;
};

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([A4_W, A4_H]);
  ctx.y = A4_H - MARGIN;
}
function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 30) newPage(ctx);
}
function text(ctx: Ctx, str: string, x: number, y: number, opts: { bold?: boolean; size?: number; color?: RGB; align?: "left" | "right" } = {}) {
  const size = opts.size ?? 9;
  const font = opts.bold ? ctx.fontB : ctx.font;
  const color = opts.color ?? BLACK;
  if (opts.align === "right") {
    const w = font.widthOfTextAtSize(str, size);
    ctx.page.drawText(str, { x: x - w, y, size, font, color });
  } else {
    ctx.page.drawText(str, { x, y, size, font, color });
  }
}

function header(ctx: Ctx, empresa: FichaEmpresa, empleadoNombre: string, activo: boolean) {
  const w = A4_W - MARGIN * 2;
  // Banda accent
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 36, width: w, height: 36, color: ACCENT });
  text(ctx, "FICHA DE EMPLEADO", MARGIN + 12, ctx.y - 16, { bold: true, size: 13, color: rgb(1, 1, 1) });
  text(ctx, v(empresa.nombre), MARGIN + 12, ctx.y - 30, { size: 9, color: rgb(1, 1, 1) });
  const estadoLabel = activo ? "ACTIVO" : "INACTIVO";
  text(ctx, estadoLabel, MARGIN + w - 12, ctx.y - 22, { bold: true, size: 10, color: rgb(1, 1, 1), align: "right" });

  ctx.y -= 50;
  // Nombre destacado
  text(ctx, empleadoNombre, MARGIN, ctx.y, { bold: true, size: 16 });
  ctx.y -= 22;
}

function seccion(ctx: Ctx, titulo: string) {
  ensureSpace(ctx, 24);
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 14, width: A4_W - MARGIN * 2, height: 14, color: LIGHT_FILL });
  text(ctx, titulo.toUpperCase(), MARGIN + 8, ctx.y - 10, { bold: true, size: 8, color: SLATE });
  ctx.y -= 20;
}

function campos(ctx: Ctx, items: Array<[string, string]>, cols = 2) {
  const w = A4_W - MARGIN * 2;
  const colW = w / cols;
  const rows = Math.ceil(items.length / cols);
  ensureSpace(ctx, rows * 16 + 4);

  for (let i = 0; i < items.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * colW;
    const y = ctx.y - row * 16;
    const [label, value] = items[i];
    text(ctx, label, x, y, { size: 7, color: SLATE });
    text(ctx, value, x, y - 10, { size: 9 });
  }
  ctx.y -= rows * 16 + 6;
}

export async function buildFichaPdf(empresa: FichaEmpresa, e: FichaEmpleado, extras: FichaExtras = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4_W, A4_H]);
  const ctx: Ctx = { doc, page, font, fontB, y: A4_H - MARGIN };

  header(ctx, empresa, e.nombre, e.activo);

  // Empresa empleadora
  seccion(ctx, "Empresa empleadora");
  campos(ctx, [
    ["Empresa", v(empresa.nombre)],
    ["N.I.F.", v(empresa.nif)],
    ["Inscripción S.S.", v(empresa.inscripcion_ss)],
    ["C.N.A.E.", v(empresa.cnae)],
    ["Centro de trabajo", v(empresa.centro_trabajo_direccion)],
  ], 2);

  // Identificación
  seccion(ctx, "Identificación");
  campos(ctx, [
    ["Nombre completo", v(e.nombre)],
    ["Tipo documento", v(e.tipo_documento)],
    ["Nº documento", v(e.documento)],
    ["Afiliación S.S.", v(e.afiliacion_ss)],
    ["Nacionalidad", v(e.nacionalidad)],
    ["Estado civil", v(e.estado_civil)],
  ], 2);

  // Datos personales
  seccion(ctx, "Datos personales");
  campos(ctx, [
    ["Fecha nacimiento", fmtFecha(e.fecha_nacimiento)],
    ["Lugar nacimiento", v(e.lugar_nacimiento)],
    ["Grupo sanguíneo", v(e.grupo_sanguineo)],
  ], 3);

  // Contacto
  seccion(ctx, "Contacto");
  campos(ctx, [
    ["Dirección", v(e.direccion)],
    ["Teléfono", v(e.telefono)],
    ["Email", v(e.email)],
  ], 2);

  // Contacto de emergencia (Fase A)
  if (e.contacto_emergencia_nombre || e.contacto_emergencia_telefono) {
    seccion(ctx, "Contacto de emergencia");
    campos(ctx, [
      ["Nombre", v(e.contacto_emergencia_nombre)],
      ["Teléfono", v(e.contacto_emergencia_telefono)],
      ["Parentesco", v(e.contacto_emergencia_parentesco)],
    ], 3);
  }

  // Laborales
  seccion(ctx, "Datos laborales");
  campos(ctx, [
    ["Cargo / Puesto", v(e.cargo)],
    ["Categoría / Nivel", v(e.categoria_nivel)],
    ["Estado", v(e.estado)],
    ["Fecha ingreso", fmtFecha(e.fecha_ingreso)],
    ["Fecha baja", fmtFecha(e.fecha_baja)],
    ["Tipo de contrato", v(e.tipo_contrato)],
    ["Jornada laboral", v(e.jornada_laboral)],
    ["Tipo de empleado", v(e.tipo_empleado)],
    ["Tipo de periodo", v(e.tipo_periodo)],
    ["Grupo de cotización", v(e.grupo_cotizacion)],
    ["Sucursal", v(e.sucursal)],
    ["Departamento", v(e.departamento)],
    ["Sección", v(e.seccion)],
    ["Supervisor", v(e.supervisor)],
  ], 2);

  // Especialidades (Fase B)
  if (extras.especialidades && extras.especialidades.length > 0) {
    seccion(ctx, "Especialidades");
    const items: Array<[string, string]> = extras.especialidades.map((esp) => [
      esp.es_principal ? `${esp.nombre} (principal)` : esp.nombre,
      v(esp.nivel),
    ]);
    campos(ctx, items, 2);
  }

  // Obra actual (desde empleado_asignaciones activa)
  if (extras.obraActual && extras.obraActual.proyecto_nombre) {
    seccion(ctx, "Obra asignada actual");
    campos(ctx, [
      ["Proyecto", v(extras.obraActual.proyecto_nombre)],
      ["Desde", fmtFecha(extras.obraActual.fecha_desde)],
      ["Hasta estimada", fmtFecha(extras.obraActual.fecha_hasta_estimada)],
    ], 3);
  }

  // Compensación — sólo si el gate del endpoint autoriza (extras.mostrarSalario)
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
        ["Vigencia", `${fmtFecha(s.fecha_desde)} → ${s.fecha_hasta ? fmtFecha(s.fecha_hasta) : "indefinido"}`],
      ], 2);
    } else {
      campos(ctx, [
        ["Salario base (denorm.)", fmtMoney(e.salario_base)],
        ["Salario complementario", fmtMoney(e.salario_complementario)],
        ["Costo por hora", fmtMoney(e.costo_hora)],
        ["Excluido de liquidaciones", e.excluir_liquidaciones ? "Sí" : "No"],
      ], 2);
    }
  }

  // Cursos y certificados (Fase D)
  if (extras.cursos && extras.cursos.length > 0) {
    seccion(ctx, "Cursos y certificados");
    const items: Array<[string, string]> = extras.cursos.map((c) => [
      c.nombre,
      c.fecha_vencimiento
        ? `${c.estado === "vencido" ? "VENCIDO " : c.estado === "por_vencer" ? "Por vencer " : ""}${fmtFecha(c.fecha_vencimiento)}`
        : "Sin fecha",
    ]);
    campos(ctx, items, 2);
  }

  // Bancarios
  seccion(ctx, "Datos bancarios");
  campos(ctx, [
    ["Banco", v(e.banco)],
    ["Número de cuenta", v(e.numero_cuenta)],
    ["Cobra con cheque", e.cobrar_con_cheque ? "Sí" : "No"],
  ], 2);

  // Chofer (si aplica)
  if (e.chofer_habilitacion || e.chofer_fecha_venc || e.chofer_km) {
    seccion(ctx, "Habilitación de chofer");
    campos(ctx, [
      ["Habilitación", v(e.chofer_habilitacion)],
      ["Vencimiento", fmtFecha(e.chofer_fecha_venc)],
      ["Kilometraje", e.chofer_km !== null ? String(e.chofer_km) : "—"],
      ["Observación", v(e.chofer_observacion)],
    ], 2);
  }

  // Comisiones
  if (e.participa_comisiones || e.comision_observacion) {
    seccion(ctx, "Comisiones");
    campos(ctx, [
      ["Participa", e.participa_comisiones ? "Sí" : "No"],
      ["Observación", v(e.comision_observacion)],
    ], 2);
  }

  // Observaciones internas (Fase A)
  if (e.observaciones) {
    seccion(ctx, "Observaciones internas");
    ensureSpace(ctx, 40);
    text(ctx, e.observaciones, MARGIN, ctx.y, { size: 8, color: SLATE });
    ctx.y -= 20;
  }

  // Footer en última página
  text(ctx, `Generado el ${fmtFecha(new Date().toISOString().slice(0, 10))}`, MARGIN, MARGIN - 8, { size: 7, color: SLATE });

  return await doc.save();
}
