/**
 * Datos de proyecto almacenados en `proyectos.brief_data` (JSON) + columnas propias.
 * Reutilizable en formularios (alta, detalle) sin acoplar a un solo componente.
 */

export type BriefFieldDef =
  | { kind: "checkbox"; key: string; label: string }
  | { kind: "text"; key: string; label: string; placeholder?: string };

export type ProyectoModuloSnapshot = {
  id: string | null;
  slug: string | null;
  nombre: string;
};

export type ProyectoSaasBriefForm = {
  empresa_nombre: string;
  whatsapp_contacto: string;
  observaciones: string;
  modulos_necesarios: ProyectoModuloSnapshot[];
};

/** Campos del brief para proyectos tipo "web" (agencia). */
export const PROYECTO_WEB_BRIEF_FIELDS: BriefFieldDef[] = [
  { kind: "text", key: "marca", label: "Nombre de la marca" },
  { kind: "text", key: "dominio_usar", label: "Dominio a usar", placeholder: "ej. midominio.com.py" },
  { kind: "text", key: "tipo_web", label: "Tipo de web" },
  { kind: "text", key: "rubro", label: "Rubro" },
  { kind: "text", key: "objetivo", label: "Objetivo de la web" },
  { kind: "text", key: "secciones", label: "Secciones necesarias" },
  { kind: "text", key: "estilo_colores", label: "Colores o estilo deseado" },
  { kind: "text", key: "logo_cliente", label: "Logo del cliente", placeholder: "https://..." },
  { kind: "text", key: "redes_sociales", label: "Redes sociales" },
  { kind: "text", key: "whatsapp_contacto", label: "WhatsApp de contacto" },
  { kind: "checkbox", key: "hosting_existente", label: "Hosting existente" },
  { kind: "text", key: "referencias_urls", label: "Referencias de páginas" },
];

/**
 * Campos del brief para OBRAS de construcción (NCG: tejados, impermeabilización,
 * cubiertas, etc.). Se muestran en la pestaña "Datos de obra" del detalle.
 *
 * Se persisten en `proyectos.brief_data` (jsonb) junto con los demás. Si un
 * tipo no usa estos campos, no se renderizan.
 */
export const PROYECTO_OBRA_BRIEF_FIELDS: BriefFieldDef[] = [
  { kind: "text", key: "direccion_obra",        label: "Dirección / ubicación",         placeholder: "Calle, número, planta…" },
  { kind: "text", key: "zona_ciudad",           label: "Zona / ciudad",                  placeholder: "Ej. Madrid Centro" },
  { kind: "text", key: "superficie_estimada",   label: "Superficie estimada",            placeholder: "Ej. 80" },
  { kind: "text", key: "unidad_principal",      label: "Unidad principal",               placeholder: "m² / metro lineal / unidad" },
  { kind: "text", key: "descripcion_trabajo",   label: "Descripción del trabajo" },
  { kind: "text", key: "estado_actual_cubierta",label: "Estado actual de la cubierta / tejado" },
  { kind: "text", key: "observaciones_tecnicas",label: "Observaciones técnicas" },
  { kind: "text", key: "tecnico_responsable",   label: "Técnico responsable" },
  { kind: "text", key: "condiciones_comerciales",label: "Condiciones comerciales",       placeholder: "Ej. 30% al iniciar, 70% al entregar" },
  { kind: "text", key: "garantia_mano_obra",    label: "Garantía mano de obra",          placeholder: "Ej. 1 año" },
  { kind: "text", key: "garantia_materiales",   label: "Garantía materiales",            placeholder: "Según garantía del fabricante" },
  { kind: "text", key: "fecha_visita",          label: "Fecha de visita técnica",        placeholder: "AAAA-MM-DD" },
  { kind: "text", key: "fecha_inicio",          label: "Fecha estimada de inicio",       placeholder: "AAAA-MM-DD" },
  { kind: "text", key: "fecha_fin",             label: "Fecha estimada de finalización", placeholder: "AAAA-MM-DD" },
];

/**
 * Códigos de tipo que se consideran "obra de construcción" para NCG.
 * Cubre los códigos que slugifica el form del catálogo de tipos.
 *
 * Si en el futuro hay un campo `categoria` en proyecto_tipos, conviene mover
 * esta lógica a una columna `es_obra: boolean` y dejar el helper como fallback.
 */
const SLUGS_OBRA_CONSTRUCTORA = new Set<string>([
  // genéricos
  "obra", "construccion", "tejado", "tejados", "cubierta", "cubiertas",
  // catálogo NCG
  "reparacion_de_tejado", "reparacion_mantenimiento_de_tejado",
  "retejado", "retejado_sustitucion_de_tejas",
  "tejas_curvas",
  "impermeabilizacion", "impermeabilizacion_y_aislamiento",
  "sistemas_ventilados",
  "paneles_sandwich", "paneles_sandwich_grecados",
  "canalones", "canalones_y_bajantes",
  "ventanas_velux", "claraboyas_velux", "ventanas_claraboyas_velux",
  "cubiertas_ligeras",
  "calculo_y_montaje", "calculo_y_montaje_de_cubiertas",
  "cubiertas_gl24", "cubiertas_de_madera_gl24",
  "accesorios_certificados",
  "mantenimiento", "obras_integrales",
]);

/**
 * Decide si un código de tipo de proyecto corresponde a una OBRA de NCG
 * (construcción/cubiertas) y por lo tanto debe usar el brief de obra,
 * ocultar campos web/SaaS/pedido, y mostrar la UI orientada a obra.
 */
export function isObraConstructora(codigoTipo: string | null | undefined): boolean {
  if (!codigoTipo) return false;
  const c = codigoTipo.trim().toLowerCase();
  if (!c) return false;
  if (SLUGS_OBRA_CONSTRUCTORA.has(c)) return true;
  // Heurística: cualquier código que CONTENGA alguno de estos términos.
  return [
    "tejado", "cubierta", "impermeab", "retejad", "velux",
    "canalon", "bajante", "sandwich", "gl24", "obra",
  ].some((k) => c.includes(k));
}

/**
 * Campos del brief para pedidos de entrega / distribución (verticales no-web).
 * Se muestran en la pestaña "Datos" del pedido y en el resumen.
 */
export const PROYECTO_ENTREGA_BRIEF_FIELDS: BriefFieldDef[] = [
  { kind: "text", key: "direccion_entrega", label: "Dirección de entrega", placeholder: "Calle y número, barrio, ciudad" },
  { kind: "text", key: "referencia_entrega", label: "Referencia / indicaciones", placeholder: "ej. casa de portón verde, entre X e Y" },
  { kind: "text", key: "telefono_contacto", label: "Teléfono de contacto", placeholder: "ej. 0981 123 456" },
  { kind: "text", key: "horario_entrega", label: "Horario preferido de entrega", placeholder: "ej. 9 a 12 hs" },
  { kind: "text", key: "observaciones_entrega", label: "Observaciones del pedido" },
];

/**
 * Unión de todos los campos conocidos del brief. Se usa para PERSISTIR
 * (applyBriefFormToExisting): así, según el tipo de proyecto, se guardan los
 * campos web o los de entrega que el usuario completó, y los vacíos se limpian.
 * El render por pestaña usa los subconjuntos `*_WEB_*` / `*_ENTREGA_*`.
 */
export const PROYECTO_DATOS_BRIEF_FIELDS: BriefFieldDef[] = [
  ...PROYECTO_WEB_BRIEF_FIELDS,
  ...PROYECTO_ENTREGA_BRIEF_FIELDS,
  ...PROYECTO_OBRA_BRIEF_FIELDS,
];

export const PROYECTO_SAAS_BRIEF_KEYS = {
  empresaNombre: "saas_empresa_nombre",
  whatsappContacto: "saas_whatsapp_contacto",
  observaciones: "saas_observaciones",
  modulosNecesarios: "saas_modulos_necesarios",
} as const;

/** Claves que pueden existir con nombres antiguos; al leer se unifican. */
const BRIEF_ALIASES: Record<string, string> = {
  dominio: "dominio_usar",
  domain: "dominio_usar",
  tipo: "tipo_web",
  tipoweb: "tipo_web",
  brand: "marca",
};

export function normalizeBriefKey(k: string): string {
  const t = k.trim();
  return BRIEF_ALIASES[t.toLowerCase()] ?? t;
}

export function coalesceBriefData(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k0, v] of Object.entries(raw as Record<string, unknown>)) {
    const k = normalizeBriefKey(k0);
    if (typeof v === "boolean") out[k] = v ? "1" : "";
    else if (v == null) out[k] = "";
    else out[k] = String(v);
  }
  return out;
}

function readRawBriefObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function normalizeModuloSnapshot(value: unknown): ProyectoModuloSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const nombre = typeof r.nombre === "string" ? r.nombre.trim() : "";
  if (!nombre) return null;
  return {
    id: typeof r.id === "string" && r.id.trim() ? r.id.trim() : null,
    slug: typeof r.slug === "string" && r.slug.trim() ? r.slug.trim() : null,
    nombre,
  };
}

export function readSaasBriefData(raw: unknown): ProyectoSaasBriefForm {
  const brief = readRawBriefObject(raw);
  const modulosRaw = brief[PROYECTO_SAAS_BRIEF_KEYS.modulosNecesarios];
  const modulos = Array.isArray(modulosRaw)
    ? modulosRaw.map(normalizeModuloSnapshot).filter((m): m is ProyectoModuloSnapshot => m != null)
    : [];
  return {
    empresa_nombre:
      typeof brief[PROYECTO_SAAS_BRIEF_KEYS.empresaNombre] === "string"
        ? String(brief[PROYECTO_SAAS_BRIEF_KEYS.empresaNombre])
        : "",
    whatsapp_contacto:
      typeof brief[PROYECTO_SAAS_BRIEF_KEYS.whatsappContacto] === "string"
        ? String(brief[PROYECTO_SAAS_BRIEF_KEYS.whatsappContacto])
        : "",
    observaciones:
      typeof brief[PROYECTO_SAAS_BRIEF_KEYS.observaciones] === "string"
        ? String(brief[PROYECTO_SAAS_BRIEF_KEYS.observaciones])
        : "",
    modulos_necesarios: modulos,
  };
}

/** Merge superficial: nuevas claves pisan las existentes; no elimina claves no enviadas. */
export function mergeBriefDataPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  for (const [k0, v] of Object.entries(patch)) {
    const k = normalizeBriefKey(k0);
    if (v === undefined) continue;
    if (v === null) {
      delete base[k];
      continue;
    }
    base[k] = v;
  }
  return base;
}

export function formatMontoPyg(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency: "PYG",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return String(n);
  }
}

export function formatFechaPyFull(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatDurationHuman(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h} h ${mm} min`;
}

export function slaTipoSnapshotLabel(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    interno: "SLA interno",
    cliente: "SLA cliente",
    pausado: "Pausado",
    final: "Final (sin acumular SLA)",
  };
  return map[t] ?? (t ? t : "—");
}

/**
 * Preserva claves extra del JSON y actualiza solo los campos del formulario de Datos.
 *
 * Los campos vacíos/desmarcados se devuelven como `null` (no se omiten): el
 * backend hace `mergeBriefDataPatch`, que conserva las claves ausentes y solo
 * elimina las que llegan en `null`. Si acá se hiciera `delete`, limpiar un campo
 * en la UI no lo borraría nunca (quedaría el valor viejo del lado del servidor).
 */
export function applyBriefFormToExisting(
  existingRaw: unknown,
  form: Record<string, string>
): Record<string, unknown> {
  const base =
    existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {};
  for (const f of PROYECTO_DATOS_BRIEF_FIELDS) {
    const v = form[f.key] ?? "";
    if (f.kind === "checkbox") {
      base[f.key] = v === "1" ? true : null;
    } else {
      const t = v.trim();
      base[f.key] = t ? t : null;
    }
  }
  return base;
}

export function applySaasFormToExisting(
  existingRaw: unknown,
  form: ProyectoSaasBriefForm
): Record<string, unknown> {
  const base = readRawBriefObject(existingRaw);
  const next = { ...base };
  const empresa = form.empresa_nombre.trim();
  const whatsapp = form.whatsapp_contacto.trim();
  const observaciones = form.observaciones.trim();
  const modulos = form.modulos_necesarios
    .map(normalizeModuloSnapshot)
    .filter((m): m is ProyectoModuloSnapshot => m != null);

  if (empresa) next[PROYECTO_SAAS_BRIEF_KEYS.empresaNombre] = empresa;
  else delete next[PROYECTO_SAAS_BRIEF_KEYS.empresaNombre];
  if (whatsapp) next[PROYECTO_SAAS_BRIEF_KEYS.whatsappContacto] = whatsapp;
  else delete next[PROYECTO_SAAS_BRIEF_KEYS.whatsappContacto];
  if (observaciones) next[PROYECTO_SAAS_BRIEF_KEYS.observaciones] = observaciones;
  else delete next[PROYECTO_SAAS_BRIEF_KEYS.observaciones];
  if (modulos.length > 0) next[PROYECTO_SAAS_BRIEF_KEYS.modulosNecesarios] = modulos;
  else delete next[PROYECTO_SAAS_BRIEF_KEYS.modulosNecesarios];

  return next;
}
