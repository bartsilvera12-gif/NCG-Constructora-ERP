import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";

/**
 * GET /api/ventas/[id]/ticket?w=58|80&mode=comandas&auto=1
 *
 * HTML imprimible NO FISCAL. Soporta dos modos:
 *
 * - Default (sin `mode`): una sola copia tipo CLIENTE.
 * - `mode=comandas`: genera múltiples copias en una sola página HTML separadas por
 *   page-break-after, calculadas automáticamente según las categorías/SKUs de los
 *   productos de la venta:
 *     · Siempre: copia CLIENTE (con precios, total, método de pago, leyenda no fiscal).
 *     · Si hay pizzas/lompizzas: copia COMANDA PIZZERÍA (sin precios).
 *     · Si hay hamburguesas/lomitos/lomitos árabes/panchos/papas/especiales: copia COMANDA PLANCHA.
 *
 * No toca SIFEN, no genera XML, no usa timbrado.
 */

/**
 * Nombre del negocio que aparece en la cabecera del ticket impreso.
 * Lee de NEURA_CLIENT_NAME (env de instancia monocliente). Se pasa a
 * MAYÚSCULAS para el look ticket-de-térmica. Fallback "NEGOCIO".
 */
const NEGOCIO = (process.env.NEURA_CLIENT_NAME?.trim() || "Negocio").toUpperCase();

// Datos del emisor por defecto (fallback si no hay fila en presupuesto_emisor_config).
const EMISOR_DEFAULT: Emisor = {
  nombre: process.env.NEURA_CLIENT_NAME?.trim() || "NCG Constructora",
  direccion: "",
  cp_ciudad: "",
  provincia: "",
  nif: "",
  tel: "",
  email: "",
};

interface Emisor {
  nombre: string;
  direccion: string;
  cp_ciudad: string;
  provincia: string;
  nif: string;
  tel: string;
  email: string;
}

// ── Clasificación PIZZERÍA / PLANCHA ───────────────────────────────────────
// Primary: categoría hija del producto. Fallback: prefijo de SKU.

const CAT_SLUGS_PIZZERIA = new Set(["pizzas", "lompizzas"]);
const CAT_SLUGS_PLANCHA = new Set([
  "hamburguesas",
  "lomitos",
  "lomitos_arabes",
  "panchos",
  "papas_fritas",
  "especiales",
]);
const CAT_NOMBRES_PIZZERIA = new Set(["PIZZAS", "LOMPIZZAS"]);
const CAT_NOMBRES_PLANCHA = new Set([
  "HAMBURGUESAS",
  "LOMITOS",
  "LOMITOS ARABES",
  "LOMITOS ÁRABES",
  "PANCHOS",
  "PAPAS FRITAS",
  "ESPECIALES",
]);

type Sector = "pizzeria" | "plancha" | null;

function classifyBySku(sku: string): Sector {
  const s = (sku || "").toUpperCase();
  if (s.startsWith("PIZ-")) return "pizzeria";
  if (s.startsWith("ESP-")) return "plancha";
  if (s.startsWith("HAM-") || s.startsWith("LOM-") || s.startsWith("PAN-") || s.startsWith("PAP-")) return "plancha";
  return null;
}

function classifyByCategoria(slug: string | null, nombre: string | null): Sector {
  const sl = (slug || "").toLowerCase();
  const nm = (nombre || "").toUpperCase();
  if (sl && CAT_SLUGS_PIZZERIA.has(sl)) return "pizzeria";
  if (sl && CAT_SLUGS_PLANCHA.has(sl)) return "plancha";
  if (nm && CAT_NOMBRES_PIZZERIA.has(nm)) return "pizzeria";
  if (nm && CAT_NOMBRES_PLANCHA.has(nm)) return "plancha";
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatGs(v: number): string {
  return `€ ${(v).toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── i18n presupuesto ───────────────────────────────────────────────────────
type Lang = "es" | "en" | "fr" | "it";
function parseLang(v: string | null): Lang {
  const s = (v || "").toLowerCase();
  if (s === "en" || s === "fr" || s === "it") return s;
  return "es";
}
const LOCALE_BY_LANG: Record<Lang, string> = {
  es: "es-ES",
  en: "en-GB",
  fr: "fr-FR",
  it: "it-IT",
};
const I18N: Record<Lang, Record<string, string>> = {
  es: {
    num_presupuesto: "Presupuesto número",
    num_factura: "Factura número",
    fecha_lbl: "Fecha",
    hoja_lbl: "Hoja nº",
    hoja_de: "de",
    col_desc: "DESCRIPCIÓN",
    col_unid: "UNIDADES",
    col_precio: "PRECIO",
    col_total: "TOTAL",
    box_base: "BASE IMPONIBLE",
    box_iva: "I.V.A.",
    box_irpf: "I.R.P.F.",
    box_total: "TOTAL",
    nif_lbl: "N.I.F.",
    tel_lbl: "Tfno.",
    email_lbl: "E-mail.",
    forma_pago_lbl: "Forma de pago",
    subtitle: "Presupuesto de obra",
    subtitle_factura: "Factura",
    tag: "PRESUPUESTO",
    tag_factura: "FACTURA",
    emitido: "Emitido",
    valido_hasta: "Válido hasta",
    cliente: "Cliente",
    cif: "CIF/NIF",
    tel: "Tel",
    ubicacion: "Ubicación de la obra",
    superficie: "Superficie",
    trabajo: "Trabajo a realizar",
    inicio: "Inicio previsto",
    plazo: "Plazo estimado",
    th_concepto: "Concepto",
    th_cant: "Cant.",
    th_punit: "P. unit.",
    th_iva: "IVA",
    th_iva_eur: "IVA €",
    th_total: "Total",
    total: "Total",
    iva_incluido: "IVA incluido",
    total_pres: "TOTAL PRESUPUESTO",
    forma_pago: "Forma de pago",
    condiciones: "Condiciones",
    gar_mo: "Garantía mano de obra",
    gar_mat: "Garantía materiales",
    no_incluido: "No incluido",
    obs_tec: "Observaciones técnicas",
    conformidad: "Conformidad del cliente",
    imprimir: "Imprimir / Guardar PDF",
    footer_validez: "Presupuesto válido {n} días desde la fecha de emisión. Los precios incluyen IVA.",
    footer_legal: "Documento interno — no constituye factura. Al aceptar este presupuesto se generará la obra correspondiente.",
  },
  en: {
    num_presupuesto: "Quote number",
    num_factura: "Invoice number",
    fecha_lbl: "Date",
    hoja_lbl: "Page",
    hoja_de: "of",
    col_desc: "DESCRIPTION",
    col_unid: "UNITS",
    col_precio: "PRICE",
    col_total: "TOTAL",
    box_base: "TAXABLE BASE",
    box_iva: "VAT",
    box_irpf: "WHT",
    box_total: "TOTAL",
    nif_lbl: "Tax ID",
    tel_lbl: "Phone",
    email_lbl: "Email",
    forma_pago_lbl: "Payment method",
    subtitle: "Construction quote",
    subtitle_factura: "Invoice",
    tag: "QUOTE",
    tag_factura: "INVOICE",
    emitido: "Issued",
    valido_hasta: "Valid until",
    cliente: "Client",
    cif: "Tax ID",
    tel: "Phone",
    ubicacion: "Project location",
    superficie: "Area",
    trabajo: "Scope of work",
    inicio: "Estimated start",
    plazo: "Estimated duration",
    th_concepto: "Description",
    th_cant: "Qty",
    th_punit: "Unit price",
    th_iva: "VAT",
    th_iva_eur: "VAT €",
    th_total: "Total",
    total: "Total",
    iva_incluido: "VAT included",
    total_pres: "QUOTE TOTAL",
    forma_pago: "Payment terms",
    condiciones: "Conditions",
    gar_mo: "Labour warranty",
    gar_mat: "Materials warranty",
    no_incluido: "Not included",
    obs_tec: "Technical notes",
    conformidad: "Client acceptance",
    imprimir: "Print / Save as PDF",
    footer_validez: "Quote valid for {n} days from the issue date. Prices include VAT.",
    footer_legal: "Internal document — not a tax invoice. Upon acceptance the corresponding project will be created.",
  },
  fr: {
    num_presupuesto: "Devis numéro",
    num_factura: "Facture numéro",
    fecha_lbl: "Date",
    hoja_lbl: "Page",
    hoja_de: "sur",
    col_desc: "DÉSIGNATION",
    col_unid: "QUANTITÉ",
    col_precio: "PRIX",
    col_total: "TOTAL",
    box_base: "BASE HT",
    box_iva: "T.V.A.",
    box_irpf: "RETENUE",
    box_total: "TOTAL",
    nif_lbl: "N° fiscal",
    tel_lbl: "Tél.",
    email_lbl: "E-mail",
    forma_pago_lbl: "Modalités de paiement",
    subtitle: "Devis de travaux",
    subtitle_factura: "Facture",
    tag: "DEVIS",
    tag_factura: "FACTURE",
    emitido: "Émis le",
    valido_hasta: "Valable jusqu'au",
    cliente: "Client",
    cif: "N° fiscal",
    tel: "Tél",
    ubicacion: "Lieu du chantier",
    superficie: "Surface",
    trabajo: "Travaux à réaliser",
    inicio: "Début prévu",
    plazo: "Durée estimée",
    th_concepto: "Désignation",
    th_cant: "Qté",
    th_punit: "P. unit.",
    th_iva: "TVA",
    th_iva_eur: "TVA €",
    th_total: "Total",
    total: "Total",
    iva_incluido: "TVA incluse",
    total_pres: "TOTAL DEVIS",
    forma_pago: "Modalités de paiement",
    condiciones: "Conditions",
    gar_mo: "Garantie main-d'œuvre",
    gar_mat: "Garantie matériaux",
    no_incluido: "Non inclus",
    obs_tec: "Observations techniques",
    conformidad: "Bon pour accord du client",
    imprimir: "Imprimer / Enregistrer en PDF",
    footer_validez: "Devis valable {n} jours à compter de la date d'émission. Les prix incluent la TVA.",
    footer_legal: "Document interne — ne constitue pas une facture. L'acceptation de ce devis entraînera la création du chantier correspondant.",
  },
  it: {
    num_presupuesto: "Preventivo numero",
    num_factura: "Fattura numero",
    fecha_lbl: "Data",
    hoja_lbl: "Pagina",
    hoja_de: "di",
    col_desc: "DESCRIZIONE",
    col_unid: "UNITÀ",
    col_precio: "PREZZO",
    col_total: "TOTALE",
    box_base: "IMPONIBILE",
    box_iva: "I.V.A.",
    box_irpf: "RIT.",
    box_total: "TOTALE",
    nif_lbl: "P. IVA",
    tel_lbl: "Tel.",
    email_lbl: "E-mail",
    forma_pago_lbl: "Modalità di pagamento",
    subtitle: "Preventivo lavori",
    subtitle_factura: "Fattura",
    tag: "PREVENTIVO",
    tag_factura: "FATTURA",
    emitido: "Emesso il",
    valido_hasta: "Valido fino al",
    cliente: "Cliente",
    cif: "Partita IVA",
    tel: "Tel",
    ubicacion: "Ubicazione del cantiere",
    superficie: "Superficie",
    trabajo: "Lavori da eseguire",
    inicio: "Inizio previsto",
    plazo: "Durata stimata",
    th_concepto: "Descrizione",
    th_cant: "Qtà",
    th_punit: "P. unit.",
    th_iva: "IVA",
    th_iva_eur: "IVA €",
    th_total: "Totale",
    total: "Totale",
    iva_incluido: "IVA inclusa",
    total_pres: "TOTALE PREVENTIVO",
    forma_pago: "Modalità di pagamento",
    condiciones: "Condizioni",
    gar_mo: "Garanzia manodopera",
    gar_mat: "Garanzia materiali",
    no_incluido: "Non incluso",
    obs_tec: "Note tecniche",
    conformidad: "Accettazione del cliente",
    imprimir: "Stampa / Salva come PDF",
    footer_validez: "Preventivo valido {n} giorni dalla data di emissione. I prezzi includono l'IVA.",
    footer_legal: "Documento interno — non costituisce fattura. All'accettazione di questo preventivo verrà creato il relativo cantiere.",
  },
};

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

function modalidadLabel(m: string | null | undefined): string {
  if (m === "local") return "Local";
  if (m === "delivery") return "Delivery";
  if (m === "carry_out") return "Retiro";
  return "";
}

function metodoPagoLabel(m: string | null | undefined): string {
  if (m === "tarjeta") return "Tarjeta";
  if (m === "transferencia") return "Transferencia";
  if (m === "efectivo") return "Efectivo";
  return "—";
}

// ── Types ──────────────────────────────────────────────────────────────────

interface VentaRow {
  id: string;
  numero_control: string;
  fecha: string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  observaciones: string | null;
  metodo_pago: string | null;
  tipo_documento: string | null;
  presupuesto_meta: Record<string, unknown> | null;
  cliente_id: string | null;
}

interface ClienteLite {
  empresa: string | null;
  nombre_contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
  ruc: string | null;
}

interface ItemRow {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number | string;
  precio_venta: number | string;
  total_linea: number | string;
  tipo_iva?: string | null;
  tipo_partida?: string | null;
  descripcion?: string | null;
}

type EnrichedItem = ItemRow & { sector: Sector };

interface PedidoBrief {
  modalidad?: "local" | "delivery" | "carry_out";
  mesa?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  observacion?: string | null;
}

// ── Render presupuesto (A4 profesional, no ticket térmico) ─────────────────

function tasaIva(tipo: string | null | undefined): number {
  if (tipo === "21%") return 0.21;
  if (tipo === "10%") return 0.10;
  if (tipo === "5%") return 0.05;
  if (tipo === "4%") return 0.04;
  return 0;
}

function metaStr(meta: Record<string, unknown> | null, key: string): string | null {
  if (!meta) return null;
  const v = meta[key];
  if (typeof v === "string") { const t = v.trim(); return t || null; }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
function metaNum(meta: Record<string, unknown> | null, key: string): number | null {
  if (!meta) return null;
  const v = meta[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}

function formatFechaCorta(iso: string | null | undefined, lang: Lang = "es"): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (lang === "en") {
      // dd/mm/yyyy también funciona en en-GB; mantenemos formato europeo uniforme.
    }
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function formatEurLang(v: number, lang: Lang): string {
  return `€ ${v.toLocaleString(LOCALE_BY_LANG[lang], { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Formatea un número plano (sin símbolo) con el locale del idioma.
function formatNumLang(v: number, lang: Lang): string {
  return v.toLocaleString(LOCALE_BY_LANG[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderPresupuesto(opts: {
  venta: VentaRow;
  items: ItemRow[];
  cliente: ClienteLite | null;
  lang: Lang;
  emisor: Emisor;
  kind?: "presupuesto" | "factura";
}): string {
  const { venta, items, cliente, lang, emisor, kind = "presupuesto" } = opts;
  const EMISOR = emisor;
  const isFactura = kind === "factura";
  const t = I18N[lang];
  const meta = venta.presupuesto_meta ?? {};

  const tituloObra = metaStr(meta, "titulo_obra") ?? "";
  const descripcion = metaStr(meta, "descripcion") ?? "";
  const ubicacion = metaStr(meta, "ubicacion") ?? "";
  const formaPago = metaStr(meta, "forma_pago");
  const condiciones = metaStr(meta, "condiciones_servicio") ?? metaStr(meta, "condiciones");
  const garantiaMo = metaStr(meta, "garantia_mano_obra");
  const garantiaMat = metaStr(meta, "garantia_materiales");
  const exclusiones = metaStr(meta, "exclusiones");
  const observacionesTec = metaStr(meta, "observaciones_tecnicas");

  // Cliente: combina entidad clientes + meta.
  const empresaDb = cliente?.empresa?.trim() || null;
  const contactoDb = cliente?.nombre_contacto?.trim() || null;
  const empresaMeta = metaStr(meta, "cliente_empresa");
  const contactoMeta = metaStr(meta, "cliente_contacto");
  const empresa = empresaDb ?? empresaMeta;
  const contacto = contactoDb ?? contactoMeta;
  const clienteNombre = empresa ?? contacto ?? "—";
  const clienteDir = cliente?.direccion ?? metaStr(meta, "cliente_direccion") ?? "";
  const clienteCiudad = cliente?.ciudad ?? metaStr(meta, "cliente_zona") ?? "";
  const clienteProvincia = metaStr(meta, "cliente_provincia") ?? "";
  const clienteRuc = cliente?.ruc ?? metaStr(meta, "cliente_ruc") ?? "";

  // Cálculo: precios en BD incluyen IVA. Derivamos base imponible por línea
  // para mostrar columnas PRECIO/TOTAL sin IVA según el formato tradicional ES.
  let baseTotal = 0;
  let ivaTotal = 0;
  const tasasUsadas = new Set<number>();
  const filasDatos = items.map((it) => {
    const cant = Number(it.cantidad);
    const totalConIva = Number(it.total_linea);
    const tasa = tasaIva(it.tipo_iva ?? null);
    const baseLinea = tasa > 0 ? totalConIva / (1 + tasa) : totalConIva;
    const ivaLinea = totalConIva - baseLinea;
    const precioBase = cant > 0 ? baseLinea / cant : 0;
    baseTotal += baseLinea;
    ivaTotal += ivaLinea;
    if (tasa > 0) tasasUsadas.add(tasa);
    return {
      cant,
      precioBase,
      baseLinea,
      nombre: it.producto_nombre || it.descripcion || "",
      desc: it.descripcion && it.descripcion !== it.producto_nombre ? it.descripcion : "",
    };
  });

  const totalGeneral = Number(venta.total);
  const ivaPct =
    tasasUsadas.size === 1
      ? Math.round([...tasasUsadas][0] * 100)
      : baseTotal > 0
      ? Math.round((ivaTotal / baseTotal) * 100)
      : 0;

  // Fila "título" arriba del listado: nombre del trabajo + ubicación.
  const tituloFila = (() => {
    const lineas: string[] = [];
    if (tituloObra) lineas.push(escapeHtml(tituloObra.toUpperCase()));
    if (ubicacion) lineas.push(escapeHtml(ubicacion.toUpperCase()));
    if (descripcion) lineas.push(escapeHtml(descripcion));
    if (lineas.length === 0) return "";
    return `<tr class="info-row">
      <td class="desc">${lineas.map((l, i) => i === 0 ? `<strong>${l}</strong>` : l).join("<br>")}</td>
      <td class="num">0,00</td><td class="num">0,00</td><td class="num">0,00</td>
    </tr>`;
  })();

  const filasItems = filasDatos.map((f) => {
    const main = `<strong>${escapeHtml(f.nombre)}</strong>`;
    const sub = f.desc ? `<br>${escapeHtml(f.desc)}` : "";
    return `<tr>
      <td class="desc">${main}${sub}</td>
      <td class="num">${formatNumLang(f.cant, lang)}</td>
      <td class="num">${formatNumLang(f.precioBase, lang)}</td>
      <td class="num">${formatNumLang(f.baseLinea, lang)}</td>
    </tr>`;
  }).join("");

  // Filas finales con condiciones / notas (cantidades 0).
  const notasArr: string[] = [];
  if (exclusiones) notasArr.push(exclusiones);
  if (formaPago) notasArr.push(formaPago);
  if (condiciones) notasArr.push(condiciones);
  if (garantiaMo) notasArr.push(garantiaMo);
  if (garantiaMat) notasArr.push(garantiaMat);
  if (observacionesTec) notasArr.push(observacionesTec);
  const filaNotas = notasArr.length > 0
    ? `<tr class="info-row">
        <td class="desc">${notasArr.map((n) => escapeHtml(n)).join("<br>")}</td>
        <td class="num">0,00</td><td class="num">0,00</td><td class="num">0,00</td>
      </tr>`
    : "";

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(t.tag)} ${escapeHtml(venta.numero_control)} — ${escapeHtml(EMISOR.nombre)}</title>
<style>
  :root { color-scheme: light; --ink: #0f172a; --muted: #595959; --line: #b7b7b7; --accent: #1f4e79; --soft: #f5f7fa; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eef2f5; color: var(--ink); font: 11.5px/1.4 Arial, "Helvetica Neue", sans-serif; }
  .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 14mm auto; padding: 14mm 14mm 16mm; box-shadow: 0 4px 24px rgba(15,23,42,.08); position: relative; }

  /* Header dos columnas: emisor (izq) y cliente (der) */
  .header { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 14px; }
  .party { font-size: 11.5px; line-height: 1.5; }
  .party .name { font-weight: 700; font-size: 12px; text-transform: uppercase; margin-bottom: 3px; }
  .party .lines div { margin: 0; }
  .party.left { padding-left: 4mm; }

  /* Línea con número de presupuesto / fecha / hoja */
  .meta-line { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); margin-bottom: 6px; font-size: 11px; }
  .meta-line .left, .meta-line .right { font-weight: 700; }
  .meta-line .mid { color: var(--ink); font-weight: 700; }

  /* Tabla de partidas */
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10.5px; }
  table.items thead th { background: var(--soft); color: var(--accent); font-weight: 700; text-align: center; padding: 7px 6px; font-size: 11px; border: 1px solid var(--line); letter-spacing: .3px; }
  table.items thead th.desc { text-align: center; }
  table.items tbody td { padding: 6px 8px; border: 1px solid var(--line); vertical-align: top; }
  table.items tbody td.desc { font-size: 10.5px; line-height: 1.45; }
  table.items tbody td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; width: 70px; }
  table.items tbody tr.info-row td.desc { font-weight: 600; }
  table.items tbody tr.info-row td.num { color: var(--muted); }
  /* fila vacía estiradora para que la tabla llene la página */
  table.items tbody tr.spacer td { border: 1px solid var(--line); border-top: none; height: 100%; }

  /* Tabla totales abajo */
  .totales { display: grid; grid-template-columns: 1.2fr 1.5fr 1.3fr 1.3fr; gap: 0; margin-top: 14px; border: 1px solid var(--line); }
  .totales .cell { padding: 8px 10px; border-right: 1px solid var(--line); }
  .totales .cell:last-child { border-right: none; }
  .totales .lbl { background: var(--soft); color: var(--accent); font-weight: 700; text-align: center; font-size: 11px; padding: 7px 10px; border-bottom: 1px solid var(--line); }
  .totales .row2 { display: contents; }
  .totales .val { text-align: center; font-variant-numeric: tabular-nums; font-size: 11.5px; padding: 10px; }
  .totales .val.total { font-weight: 800; font-size: 13px; color: var(--ink); }
  .totales .iva-pct, .totales .irpf-pct { display: inline-block; min-width: 38px; text-align: left; }
  .totales .iva-cell, .totales .irpf-cell { display: flex; justify-content: space-between; gap: 8px; }

  .forma-pago-box { margin-top: 16px; padding: 8px 12px; border: 1px solid var(--line); font-size: 11px; color: var(--ink); }

  .actions { max-width: 210mm; margin: 0 auto 30px; text-align: right; padding: 0 14mm; }
  .actions button { padding: 9px 18px; font-size: 13px; cursor: pointer; border: 1px solid var(--accent); background: var(--accent); color: #fff; border-radius: 6px; font-weight: 600; }
  .actions button:hover { opacity: .9; }

  @media print {
    body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; width: 100%; min-height: auto; padding: 12mm; }
    .actions { display: none; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="party left">
        <div class="name">${escapeHtml(EMISOR.nombre)}</div>
        <div class="lines">
          ${EMISOR.direccion ? `<div>${escapeHtml(EMISOR.direccion)}</div>` : ""}
          ${EMISOR.cp_ciudad ? `<div>${escapeHtml(EMISOR.cp_ciudad)}</div>` : ""}
          ${EMISOR.provincia ? `<div>${escapeHtml(EMISOR.provincia)}</div>` : ""}
          ${EMISOR.nif ? `<div>${escapeHtml(t.nif_lbl)} ${escapeHtml(EMISOR.nif)}</div>` : ""}
          ${EMISOR.tel ? `<div>${escapeHtml(t.tel_lbl)} ${escapeHtml(EMISOR.tel)}</div>` : ""}
          ${EMISOR.email ? `<div>${escapeHtml(t.email_lbl)} ${escapeHtml(EMISOR.email)}</div>` : ""}
        </div>
      </div>
      <div class="party right">
        <div class="name">${escapeHtml(clienteNombre)}</div>
        <div class="lines">
          ${clienteDir ? `<div>${escapeHtml(clienteDir)}</div>` : ""}
          ${clienteCiudad ? `<div>${escapeHtml(clienteCiudad)}</div>` : ""}
          ${clienteProvincia ? `<div>${escapeHtml(clienteProvincia)}</div>` : ""}
          ${clienteRuc ? `<div>${escapeHtml(t.nif_lbl)} ${escapeHtml(clienteRuc)}</div>` : ""}
        </div>
      </div>
    </div>

    <div class="meta-line">
      <div class="left">${escapeHtml(isFactura ? t.num_factura : t.num_presupuesto)}: ${escapeHtml(venta.numero_control)}</div>
      <div class="mid">${escapeHtml(t.fecha_lbl)}: ${formatFechaCorta(venta.fecha, lang)}</div>
      <div class="right">${escapeHtml(t.hoja_lbl)}: 1 ${escapeHtml(t.hoja_de)} 1</div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="desc">${escapeHtml(t.col_desc)}</th>
          <th>${escapeHtml(t.col_unid)}</th>
          <th>${escapeHtml(t.col_precio)}</th>
          <th>${escapeHtml(t.col_total)}</th>
        </tr>
      </thead>
      <tbody>
        ${tituloFila}
        ${filasItems}
        ${filaNotas}
      </tbody>
    </table>

    <div class="totales">
      <div class="lbl">${escapeHtml(t.box_base)}</div>
      <div class="lbl">${escapeHtml(t.box_iva)}</div>
      <div class="lbl">${escapeHtml(t.box_irpf)}</div>
      <div class="lbl">${escapeHtml(t.box_total)}</div>
      <div class="val">${formatNumLang(baseTotal, lang)}</div>
      <div class="val iva-cell"><span class="iva-pct">${ivaPct}%</span><span>${formatNumLang(ivaTotal, lang)}</span></div>
      <div class="val irpf-cell"><span class="irpf-pct">0%</span><span>0,00</span></div>
      <div class="val total">${formatNumLang(totalGeneral, lang)}</div>
    </div>

    ${isFactura && (formaPago || venta.metodo_pago) ? `
    <div class="forma-pago-box">
      ${escapeHtml(t.forma_pago_lbl)}: ${escapeHtml(formaPago ?? metodoPagoLabel(venta.metodo_pago))}
    </div>` : ""}
  </div>

  <div class="actions">
    <button type="button" onclick="window.print()">${escapeHtml(t.imprimir)}</button>
  </div>
  <script>
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('auto') === '1') {
        setTimeout(function(){ window.print(); }, 250);
      }
    } catch (e) {}
  </script>
</body>
</html>`;
}

// ── Render de cada copia ───────────────────────────────────────────────────

function renderCopia(opts: {
  tipo: "cliente" | "pizzeria" | "plancha";
  venta: VentaRow;
  items: EnrichedItem[];
  brief: PedidoBrief | null;
  fontPx: number;
  isLast: boolean;
}): string {
  const { tipo, venta, items, brief, fontPx, isLast } = opts;
  const showPrices = tipo === "cliente";
  const sectorBadge = tipo === "pizzeria" ? "COMANDA PIZZERÍA" : tipo === "plancha" ? "COMANDA PLANCHA" : "";
  const modalidad = modalidadLabel(brief?.modalidad);

  // Filas de ítems: en cliente todas; en cocina todas también, pero las del propio sector destacadas.
  const itemsHtml = items
    .map((it) => {
      const cant = Number(it.cantidad);
      const punit = Number(it.precio_venta);
      const sub = Number(it.total_linea);
      const matchesSector =
        (tipo === "pizzeria" && it.sector === "pizzeria") ||
        (tipo === "plancha" && it.sector === "plancha");
      const cls = matchesSector ? "match" : tipo === "cliente" ? "" : "muted";
      const main = showPrices
        ? `<tr class="${cls}">
             <td class="qty"><strong>${cant}×</strong></td>
             <td class="name">${escapeHtml(it.producto_nombre)}</td>
             <td class="amt">${formatGs(sub)}</td>
           </tr>
           <tr class="sub"><td></td><td colspan="2">${cant} × ${formatGs(punit)}</td></tr>`
        : `<tr class="${cls}">
             <td class="qty"><strong>${cant}×</strong></td>
             <td class="name" colspan="2"><strong>${escapeHtml(it.producto_nombre)}</strong></td>
           </tr>`;
      return main;
    })
    .join("");

  const subtotal = Number(venta.subtotal);
  const ivaTotal = Number(venta.monto_iva);
  const total = Number(venta.total);

  const datosPedido: string[] = [];
  if (modalidad) {
    datosPedido.push(
      `<div><strong>${modalidad}</strong>${brief?.mesa ? ` · Mesa ${escapeHtml(brief.mesa)}` : ""}</div>`
    );
  }
  if (brief?.cliente_nombre) datosPedido.push(`<div>Cliente: ${escapeHtml(brief.cliente_nombre)}</div>`);
  if (brief?.cliente_telefono) datosPedido.push(`<div>Tel: ${escapeHtml(brief.cliente_telefono)}</div>`);
  if (brief?.direccion_entrega) datosPedido.push(`<div>Dir: ${escapeHtml(brief.direccion_entrega)}</div>`);
  const obs = brief?.observacion || venta.observaciones || "";

  const headerCocina = sectorBadge
    ? `<div class="sector-banner">${sectorBadge}</div>`
    : "";
  const totalesHtml = showPrices
    ? `<hr>
       <table class="totales">
         <tbody>
           <tr><td class="lbl">Subtotal</td><td class="val">${formatGs(subtotal)}</td></tr>
           ${ivaTotal > 0 ? `<tr><td class="lbl">IVA</td><td class="val">${formatGs(ivaTotal)}</td></tr>` : ""}
           <tr class="total-row"><td class="lbl">TOTAL</td><td class="val">${formatGs(total)}</td></tr>
           <tr><td class="lbl">Pago</td><td class="val">${metodoPagoLabel(venta.metodo_pago)}</td></tr>
         </tbody>
       </table>`
    : "";
  const footerHtml = showPrices
    ? `<hr>
       <div class="footer">
         ¡Gracias por tu compra!<br>
         Comprobante interno — no válido como factura legal.
       </div>`
    : `<div class="footer-cocina">${formatFecha(venta.fecha)}</div>`;

  return `<section class="paper ${isLast ? "last" : ""}">
    ${headerCocina || `<h1>${NEGOCIO}</h1>`}
    <div class="meta">
      ${escapeHtml(venta.numero_control)}<br>
      ${formatFecha(venta.fecha)}
    </div>
    ${datosPedido.length > 0 ? `<hr><div class="pedido">${datosPedido.join("")}</div>` : ""}
    <hr>
    <table>
      <tbody>${itemsHtml}</tbody>
    </table>
    ${totalesHtml}
    ${obs ? `<hr><div class="obs"><strong>Obs:</strong> ${escapeHtml(obs)}</div>` : ""}
    ${footerHtml}
  </section>`;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const url = new URL(request.url);
  const wParam = url.searchParams.get("w");
  const widthMm = wParam === "58" ? 58 : 80;
  const fontPx = widthMm === 58 ? 11 : 12;
  const modeComandas = url.searchParams.get("mode") === "comandas";

  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const empresaId = ctx.auth.empresa_id;

  // Venta
  const vQ = await ctx.supabase
    .from("ventas")
    .select("id, numero_control, fecha, subtotal, monto_iva, total, observaciones, metodo_pago, tipo_documento, presupuesto_meta, cliente_id")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (vQ.error) return new NextResponse(`Error: ${vQ.error.message}`, { status: 500 });
  if (!vQ.data) return new NextResponse("Venta no encontrada", { status: 404 });
  const venta = vQ.data as unknown as VentaRow;

  // Items — para presupuestos pedimos también tipo_iva, tipo_partida, descripcion
  // (la tabla los tiene; el ticket térmico no los usa pero el presupuesto sí).
  const iQ = await ctx.supabase
    .from("ventas_items")
    .select("producto_id, producto_nombre, sku, cantidad, precio_venta, total_linea, tipo_iva, tipo_partida, descripcion")
    .eq("venta_id", id)
    .eq("empresa_id", empresaId);
  if (iQ.error) return new NextResponse(`Error items: ${iQ.error.message}`, { status: 500 });
  const itemsRaw = (iQ.data ?? []) as unknown as ItemRow[];

  // ── Branch: presupuesto o venta-factura (A4) ───────────────────────────────
  // Por defecto las ventas también imprimen factura A4. Solo `mode=comandas`
  // mantiene el ticket térmico de cocina/POS.
  const esPresupuesto = venta.tipo_documento === "presupuesto";
  if (esPresupuesto || !modeComandas) {
    let cliente: ClienteLite | null = null;
    if (venta.cliente_id) {
      const cQ = await ctx.supabase
        .from("clientes")
        .select("empresa, nombre_contacto, telefono, email, direccion, ciudad, ruc")
        .eq("id", venta.cliente_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (!cQ.error && cQ.data) cliente = cQ.data as ClienteLite;
    }
    const lang = parseLang(url.searchParams.get("lang"));
    // Datos del emisor desde presupuesto_emisor_config (single-row por empresa).
    let emisor: Emisor = { ...EMISOR_DEFAULT };
    try {
      const eQ = await ctx.supabase
        .from("presupuesto_emisor_config")
        .select("nombre, direccion, cp_ciudad, provincia, nif, telefono, email")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (!eQ.error && eQ.data) {
        const e = eQ.data as Record<string, string | null>;
        emisor = {
          nombre: e.nombre?.trim() || EMISOR_DEFAULT.nombre,
          direccion: e.direccion?.trim() || "",
          cp_ciudad: e.cp_ciudad?.trim() || "",
          provincia: e.provincia?.trim() || "",
          nif: e.nif?.trim() || "",
          tel: e.telefono?.trim() || "",
          email: e.email?.trim() || "",
        };
      }
    } catch {}
    const html = renderPresupuesto({ venta, items: itemsRaw, cliente, lang, emisor, kind: esPresupuesto ? "presupuesto" : "factura" });
    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Pedido cocina (opcional) — busca card de Pedidos vinculada a esta venta.
  let brief: PedidoBrief | null = null;
  try {
    const pQ = await ctx.supabase
      .from("proyectos")
      .select("brief_data")
      .eq("empresa_id", empresaId)
      .filter("metadata->>venta_id", "eq", id)
      .limit(1)
      .maybeSingle();
    if (!pQ.error && pQ.data) {
      brief = (pQ.data as { brief_data: PedidoBrief }).brief_data ?? null;
    }
  } catch {
    brief = null;
  }

  // Clasificación por categoría (primary) + SKU (fallback)
  const productoIds = [...new Set(itemsRaw.map((i) => i.producto_id))];
  const sectorByProd = new Map<string, Sector>();
  if (productoIds.length > 0) {
    try {
      // producto_categorias[principal] -> categorias_productos(slug, nombre)
      const pcQ = await ctx.supabase
        .from("producto_categorias")
        .select("producto_id, categoria_id, es_principal")
        .eq("empresa_id", empresaId)
        .in("producto_id", productoIds);
      const pcRows = (pcQ.data ?? []) as Array<{
        producto_id: string;
        categoria_id: string;
        es_principal: boolean | null;
      }>;
      const catIds = [...new Set(pcRows.map((r) => r.categoria_id))];
      const catMap = new Map<string, { slug: string | null; nombre: string | null }>();
      if (catIds.length > 0) {
        const cQ = await ctx.supabase
          .from("categorias_productos")
          .select("id, slug, nombre")
          .eq("empresa_id", empresaId)
          .in("id", catIds);
        for (const c of (cQ.data ?? []) as Array<{ id: string; slug: string | null; nombre: string | null }>) {
          catMap.set(c.id, { slug: c.slug ?? null, nombre: c.nombre ?? null });
        }
      }
      // Priorizamos la categoría es_principal=true; si no, la primera que matchee.
      for (const pid of productoIds) {
        const myCats = pcRows.filter((r) => r.producto_id === pid);
        const order = [...myCats].sort((a, b) => (a.es_principal ? -1 : 1) - (b.es_principal ? -1 : 1));
        let s: Sector = null;
        for (const r of order) {
          const meta = catMap.get(r.categoria_id);
          s = classifyByCategoria(meta?.slug ?? null, meta?.nombre ?? null);
          if (s) break;
        }
        sectorByProd.set(pid, s);
      }
    } catch {
      // ignoramos errores de categorías; cae al fallback por SKU.
    }
  }

  const items: EnrichedItem[] = itemsRaw.map((it) => {
    const fromCat = sectorByProd.get(it.producto_id) ?? null;
    const sector: Sector = fromCat ?? classifyBySku(it.sku);
    return { ...it, sector };
  });

  // Decidir qué copias imprimir
  const hayPizzeria = items.some((i) => i.sector === "pizzeria");
  const hayPlancha = items.some((i) => i.sector === "plancha");

  const copias: Array<"cliente" | "pizzeria" | "plancha"> = ["cliente"];
  if (modeComandas) {
    if (hayPizzeria) copias.push("pizzeria");
    if (hayPlancha) copias.push("plancha");
  }

  const seccionesHtml = copias
    .map((tipo, idx) =>
      renderCopia({ tipo, venta, items, brief, fontPx, isLast: idx === copias.length - 1 })
    )
    .join("");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Ticket ${escapeHtml(venta.numero_control)} — ${NEGOCIO}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, "Courier New", monospace; font-size: ${fontPx}px; color: #000; background: #f1f1f1; margin: 0; padding: 20px; }
  .paper { background: #fff; width: ${widthMm}mm; margin: 0 auto 12mm; padding: 6mm 4mm; box-shadow: 0 1px 4px rgba(0,0,0,0.1); page-break-after: always; break-after: page; }
  .paper.last { page-break-after: auto; break-after: auto; margin-bottom: 0; }
  h1 { font-size: ${fontPx + 4}px; text-align: center; margin: 0 0 2mm; letter-spacing: 1px; }
  .sector-banner { font-size: ${fontPx + 6}px; font-weight: 800; text-align: center; padding: 2mm; border: 2px solid #000; margin: 0 0 3mm; letter-spacing: 1px; }
  .meta { font-size: ${fontPx - 1}px; text-align: center; margin: 1mm 0 2mm; }
  hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  .pedido { font-size: ${fontPx}px; margin: 1mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 0.5mm 0; }
  td.qty { width: 9mm; }
  td.amt { width: 22mm; text-align: right; white-space: nowrap; }
  tr.sub td { color: #555; font-size: ${fontPx - 2}px; padding-bottom: 1mm; }
  tr.muted td { color: #777; font-style: italic; }
  tr.match td { background: #fffbcc; }
  .totales td { padding: 0.7mm 0; }
  .totales .lbl { text-align: left; }
  .totales .val { text-align: right; white-space: nowrap; }
  .total-row { font-weight: bold; font-size: ${fontPx + 2}px; border-top: 1px solid #000; }
  .obs { font-size: ${fontPx - 1}px; margin: 2mm 0; }
  .footer { font-size: ${fontPx - 2}px; text-align: center; margin-top: 3mm; font-style: italic; }
  .footer-cocina { font-size: ${fontPx - 2}px; text-align: center; margin-top: 3mm; font-weight: bold; }
  .actions { max-width: ${widthMm}mm; margin: 8mm auto 0; text-align: center; }
  .actions button { padding: 8px 16px; font-size: 13px; cursor: pointer; border: 1px solid #333; background: #fff; border-radius: 6px; }
  .actions button:hover { background: #f5f5f5; }
  .actions a { margin-left: 12px; font-size: 13px; color: #444; }
  @media print {
    body { background: #fff; padding: 0; }
    .paper { width: ${widthMm}mm; box-shadow: none; padding: 2mm; margin: 0; }
    .actions { display: none; }
    @page { margin: 0; size: ${widthMm}mm auto; }
  }
</style>
</head>
<body>
  ${seccionesHtml}
  <div class="actions">
    <button type="button" onclick="window.print()">Imprimir</button>
    <a href="?${modeComandas ? "mode=comandas&" : ""}w=${widthMm === 80 ? 58 : 80}">Cambiar a ${widthMm === 80 ? 58 : 80}mm</a>
  </div>
  <script>
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('auto') === '1') {
        setTimeout(function(){ window.print(); }, 250);
      }
    } catch (e) {}
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
