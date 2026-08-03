/**
 * Motor de asientos contables.
 *
 * Genera asientos de partida doble a partir de operaciones (venta, compra,
 * gasto, pago). Valida que suma debe = suma haber. Usa la config contable
 * de la empresa para saber a qué cuenta va cada tipo de movimiento.
 *
 * Cada operación es idempotente por (origen_tipo, origen_id): si ya existe
 * un asiento para esa venta/compra, no se duplica (se reemplaza).
 */

import type { AppSupabaseClient } from "@/lib/supabase/schema";

export type LineaAsiento = {
  cuenta_id: string;
  debe: number;
  haber: number;
  descripcion?: string | null;
};

export type CrearAsientoParams = {
  fecha: string;              // YYYY-MM-DD
  concepto: string;
  origen_tipo: "venta" | "compra" | "gasto" | "pago" | "cobro" | "manual" | "ajuste";
  origen_id?: string | null;
  lineas: LineaAsiento[];
  created_by?: string | null;
  observacion?: string | null;
};

type ConfigContable = {
  cuenta_clientes: string | null;
  cuenta_proveedores: string | null;
  cuenta_ventas: string | null;
  cuenta_compras: string | null;
  cuenta_gastos: string | null;
  cuenta_iva_repercutido_4: string | null;
  cuenta_iva_repercutido_10: string | null;
  cuenta_iva_repercutido_21: string | null;
  cuenta_iva_soportado_4: string | null;
  cuenta_iva_soportado_10: string | null;
  cuenta_iva_soportado_21: string | null;
  cuenta_irpf: string | null;
  cuenta_caja: string | null;
  cuenta_banco: string | null;
};

const CENT = 100;
const roundEur = (n: number) => Math.round(n * CENT) / CENT;

function tasaIvaFromTipo(tipo: string | null | undefined): 0 | 0.04 | 0.10 | 0.21 {
  const raw = String(tipo ?? "").trim();
  if (raw === "21%" || raw === "21") return 0.21;
  if (raw === "10%" || raw === "10") return 0.10;
  if (raw === "4%"  || raw === "4")  return 0.04;
  return 0;
}

async function getConfig(sb: AppSupabaseClient, empresaId: string): Promise<ConfigContable | null> {
  const { data, error } = await sb
    .from("contable_config")
    .select("cuenta_clientes, cuenta_proveedores, cuenta_ventas, cuenta_compras, cuenta_gastos, cuenta_iva_repercutido_4, cuenta_iva_repercutido_10, cuenta_iva_repercutido_21, cuenta_iva_soportado_4, cuenta_iva_soportado_10, cuenta_iva_soportado_21, cuenta_irpf, cuenta_caja, cuenta_banco")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ConfigContable;
}

async function nextNumero(sb: AppSupabaseClient, empresaId: string, fecha: string): Promise<string> {
  const anio = fecha.slice(0, 4);
  // Buscamos el último asiento del año.
  const { data } = await sb
    .from("asientos_contables")
    .select("numero")
    .eq("empresa_id", empresaId)
    .like("numero", `${anio}-%`)
    .order("numero", { ascending: false })
    .limit(1);
  const last = (data ?? [])[0] as { numero?: string } | undefined;
  let seq = 1;
  if (last?.numero) {
    const parts = last.numero.split("-");
    const n = parseInt(parts[1] ?? "", 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${anio}-${String(seq).padStart(5, "0")}`;
}

/**
 * Crea un asiento validando partida doble. Idempotente por (origen_tipo,
 * origen_id): si ya hay un asiento con ese origen, lo elimina primero.
 */
export async function crearAsiento(
  sb: AppSupabaseClient,
  empresaId: string,
  params: CrearAsientoParams
): Promise<{ ok: true; id: string; numero: string } | { ok: false; error: string }> {
  // Filtro líneas con debe+haber=0 (pueden aparecer por sumas exactas cero).
  const lineas = params.lineas.filter((l) => roundEur(l.debe) > 0 || roundEur(l.haber) > 0);
  if (lineas.length < 2) return { ok: false, error: "El asiento debe tener al menos 2 líneas." };

  const sumaDebe  = roundEur(lineas.reduce((s, l) => s + Number(l.debe || 0),  0));
  const sumaHaber = roundEur(lineas.reduce((s, l) => s + Number(l.haber || 0), 0));
  if (sumaDebe !== sumaHaber) {
    return { ok: false, error: `Descuadre: debe ${sumaDebe} ≠ haber ${sumaHaber}` };
  }
  if (sumaDebe === 0) return { ok: false, error: "Asiento con importes en cero." };

  // Idempotencia: si ya existe un asiento con ese origen, lo elimino.
  if (params.origen_tipo && params.origen_id) {
    await sb
      .from("asientos_contables")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("origen_tipo", params.origen_tipo)
      .eq("origen_id", params.origen_id);
  }

  const numero = await nextNumero(sb, empresaId, params.fecha);
  const ins = await sb
    .from("asientos_contables")
    .insert({
      empresa_id: empresaId,
      numero,
      fecha: params.fecha,
      concepto: params.concepto,
      origen_tipo: params.origen_tipo,
      origen_id: params.origen_id ?? null,
      observacion: params.observacion ?? null,
      created_by: params.created_by ?? null,
    })
    .select("id")
    .single();
  if (ins.error || !ins.data) return { ok: false, error: ins.error?.message ?? "no data" };
  const asientoId = (ins.data as { id: string }).id;

  const rows = lineas.map((l, i) => ({
    empresa_id: empresaId,
    asiento_id: asientoId,
    cuenta_id: l.cuenta_id,
    debe:  roundEur(l.debe  || 0),
    haber: roundEur(l.haber || 0),
    descripcion: l.descripcion ?? null,
    orden: i,
  }));
  const insL = await sb.from("asientos_lineas").insert(rows);
  if (insL.error) {
    await sb.from("asientos_contables").delete().eq("id", asientoId);
    return { ok: false, error: insL.error.message };
  }
  return { ok: true, id: asientoId, numero };
}

// ── Asentador de VENTA ──────────────────────────────────────────────────────

/**
 * Asienta una venta:
 *   Debe:  430 Clientes                    (total)
 *   Haber: 706/700 Ventas                  (base imponible por tasa)
 *   Haber: 4770/4771/4772 IVA repercutido  (cuota IVA por tasa)
 */
export async function asentarVenta(
  sb: AppSupabaseClient,
  empresaId: string,
  ventaId: string
): Promise<{ ok: boolean; error?: string; asiento_id?: string }> {
  const cfg = await getConfig(sb, empresaId);
  if (!cfg) return { ok: false, error: "Config contable no encontrada. Sembrar con /api/contabilidad/seed." };
  if (!cfg.cuenta_clientes || !cfg.cuenta_ventas) return { ok: false, error: "Faltan cuentas de clientes o ventas en la config." };

  const vQ = await sb
    .from("ventas")
    .select("id, numero_control, fecha, total, cliente_id, clientes:cliente_id(empresa, nombre_contacto)")
    .eq("id", ventaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (vQ.error || !vQ.data) return { ok: false, error: vQ.error?.message ?? "Venta no encontrada" };
  const v = vQ.data as Record<string, unknown>;

  const iQ = await sb
    .from("ventas_items")
    .select("tipo_iva, total_linea")
    .eq("venta_id", ventaId)
    .eq("empresa_id", empresaId);
  if (iQ.error) return { ok: false, error: iQ.error.message };
  const items = (iQ.data ?? []) as Array<{ tipo_iva: string | null; total_linea: number }>;

  // Agrupamos por tasa.
  const bases: Record<0 | 0.04 | 0.10 | 0.21, number> = { 0: 0, 0.04: 0, 0.10: 0, 0.21: 0 };
  const ivas:  Record<0 | 0.04 | 0.10 | 0.21, number> = { 0: 0, 0.04: 0, 0.10: 0, 0.21: 0 };
  for (const it of items) {
    const t = tasaIvaFromTipo(it.tipo_iva);
    const totalLinea = Number(it.total_linea);
    const base = t > 0 ? totalLinea / (1 + t) : totalLinea;
    const iva = totalLinea - base;
    bases[t] += base;
    ivas[t]  += iva;
  }
  const total = Number(v.total ?? 0);
  const cli = v.clientes as { empresa?: string; nombre_contacto?: string } | { empresa?: string; nombre_contacto?: string }[] | null;
  const c = Array.isArray(cli) ? cli[0] : cli;
  const nombre = c?.empresa?.trim() || c?.nombre_contacto?.trim() || "Cliente";

  const lineas: LineaAsiento[] = [
    // Debe: Clientes
    { cuenta_id: cfg.cuenta_clientes, debe: total, haber: 0, descripcion: `Venta ${v.numero_control} · ${nombre}` },
  ];
  // Haber: Ventas por cada base
  const baseTotal = bases[0] + bases[0.04] + bases[0.10] + bases[0.21];
  if (baseTotal > 0) {
    lineas.push({ cuenta_id: cfg.cuenta_ventas, debe: 0, haber: baseTotal, descripcion: `Ventas · ${v.numero_control}` });
  }
  // Haber: IVA repercutido por tasa
  const mapRep: Record<string, string | null> = {
    "0.04": cfg.cuenta_iva_repercutido_4,
    "0.10": cfg.cuenta_iva_repercutido_10,
    "0.21": cfg.cuenta_iva_repercutido_21,
  };
  for (const t of [0.04, 0.10, 0.21] as const) {
    if (ivas[t] > 0) {
      const cuenta = mapRep[String(t)];
      if (!cuenta) return { ok: false, error: `Falta cuenta IVA repercutido ${Math.round(t * 100)}%` };
      lineas.push({ cuenta_id: cuenta, debe: 0, haber: ivas[t], descripcion: `IVA ${Math.round(t * 100)}%` });
    }
  }

  const res = await crearAsiento(sb, empresaId, {
    fecha: String(v.fecha),
    concepto: `Venta ${v.numero_control} · ${nombre}`,
    origen_tipo: "venta",
    origen_id: ventaId,
    lineas,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, asiento_id: res.id };
}

// ── Asentador de COMPRA ─────────────────────────────────────────────────────

/**
 * Asienta una compra:
 *   Debe:  600 Compras + 4720/4721/4722 IVA soportado
 *   Haber: 400 Proveedores  (total)
 */
export async function asentarCompra(
  sb: AppSupabaseClient,
  empresaId: string,
  compraId: string
): Promise<{ ok: boolean; error?: string; asiento_id?: string }> {
  const cfg = await getConfig(sb, empresaId);
  if (!cfg) return { ok: false, error: "Config contable no encontrada." };
  if (!cfg.cuenta_proveedores || !cfg.cuenta_compras) return { ok: false, error: "Faltan cuentas de proveedores o compras." };

  const cQ = await sb
    .from("compras")
    .select("id, fecha, total, tipo_iva, numero_comprobante, proveedor_id, proveedores:proveedor_id(nombre)")
    .eq("id", compraId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (cQ.error || !cQ.data) return { ok: false, error: cQ.error?.message ?? "Compra no encontrada" };
  const c = cQ.data as Record<string, unknown>;

  const total = Number(c.total ?? 0);
  const t = tasaIvaFromTipo(c.tipo_iva as string | null);
  const base = t > 0 ? total / (1 + t) : total;
  const iva  = total - base;

  const prov = c.proveedores as { nombre?: string } | { nombre?: string }[] | null;
  const p = Array.isArray(prov) ? prov[0] : prov;
  const nombreProv = p?.nombre ?? "Proveedor";

  const mapSop: Record<string, string | null> = {
    "0.04": cfg.cuenta_iva_soportado_4,
    "0.10": cfg.cuenta_iva_soportado_10,
    "0.21": cfg.cuenta_iva_soportado_21,
  };

  const lineas: LineaAsiento[] = [
    { cuenta_id: cfg.cuenta_compras, debe: base, haber: 0, descripcion: `Compra ${c.numero_comprobante ?? ""}` },
  ];
  if (iva > 0) {
    const cuentaIva = mapSop[String(t)];
    if (!cuentaIva) return { ok: false, error: `Falta cuenta IVA soportado ${Math.round(t * 100)}%` };
    lineas.push({ cuenta_id: cuentaIva, debe: iva, haber: 0, descripcion: `IVA soportado ${Math.round(t * 100)}%` });
  }
  lineas.push({ cuenta_id: cfg.cuenta_proveedores, debe: 0, haber: total, descripcion: `Proveedor · ${nombreProv}` });

  const res = await crearAsiento(sb, empresaId, {
    fecha: String(c.fecha),
    concepto: `Compra ${c.numero_comprobante ?? ""} · ${nombreProv}`,
    origen_tipo: "compra",
    origen_id: compraId,
    lineas,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, asiento_id: res.id };
}

// ── Asentador de GASTO ──────────────────────────────────────────────────────

/**
 * Asienta un gasto:
 *   Debe:  629 Gastos + IVA soportado
 *   Haber: 400 Proveedores / 570 Caja / 572 Bancos (según forma_pago)
 */
export async function asentarGasto(
  sb: AppSupabaseClient,
  empresaId: string,
  gastoId: string
): Promise<{ ok: boolean; error?: string; asiento_id?: string }> {
  const cfg = await getConfig(sb, empresaId);
  if (!cfg) return { ok: false, error: "Config contable no encontrada." };
  if (!cfg.cuenta_gastos) return { ok: false, error: "Falta cuenta de gastos." };

  const gQ = await sb
    .from("gastos")
    .select("id, fecha, descripcion, total, tipo_iva, forma_pago, proveedor_nombre")
    .eq("id", gastoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (gQ.error || !gQ.data) return { ok: false, error: gQ.error?.message ?? "Gasto no encontrado" };
  const g = gQ.data as Record<string, unknown>;

  const total = Number(g.total ?? 0);
  const t = tasaIvaFromTipo(g.tipo_iva as string | null);
  const base = t > 0 ? total / (1 + t) : total;
  const iva  = total - base;

  const formaPago = String(g.forma_pago ?? "").toLowerCase();
  const cuentaHaber =
    formaPago === "efectivo" || formaPago === "caja"
      ? cfg.cuenta_caja
      : formaPago === "banco" || formaPago === "transferencia" || formaPago === "tarjeta"
      ? cfg.cuenta_banco
      : cfg.cuenta_proveedores;
  if (!cuentaHaber) return { ok: false, error: `Falta cuenta contrapartida (${formaPago || "sin forma_pago"})` };

  const mapSop: Record<string, string | null> = {
    "0.04": cfg.cuenta_iva_soportado_4,
    "0.10": cfg.cuenta_iva_soportado_10,
    "0.21": cfg.cuenta_iva_soportado_21,
  };

  const lineas: LineaAsiento[] = [
    { cuenta_id: cfg.cuenta_gastos, debe: base, haber: 0, descripcion: String(g.descripcion ?? "Gasto").slice(0, 80) },
  ];
  if (iva > 0) {
    const cuentaIva = mapSop[String(t)];
    if (!cuentaIva) return { ok: false, error: `Falta cuenta IVA soportado ${Math.round(t * 100)}%` };
    lineas.push({ cuenta_id: cuentaIva, debe: iva, haber: 0, descripcion: `IVA soportado ${Math.round(t * 100)}%` });
  }
  lineas.push({ cuenta_id: cuentaHaber, debe: 0, haber: total, descripcion: String(g.proveedor_nombre ?? "") });

  const res = await crearAsiento(sb, empresaId, {
    fecha: String(g.fecha),
    concepto: String(g.descripcion ?? "Gasto").slice(0, 120),
    origen_tipo: "gasto",
    origen_id: gastoId,
    lineas,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, asiento_id: res.id };
}

// ── Asentador de PAGO (cobro de venta o pago a proveedor) ──────────────────

/**
 * Asienta un pago genérico. Requiere pasarle el `sentido`:
 *   - "cobro":  Debe: Caja/Banco     · Haber: Clientes
 *   - "pago":   Debe: Proveedores    · Haber: Caja/Banco
 *
 * NOTA: NCG tiene tabla `pagos` (ingresos) y potencialmente otras para egresos.
 * Este helper es genérico; los callers arman el registro.
 */
export async function asentarMovimientoTesoreria(
  sb: AppSupabaseClient,
  empresaId: string,
  params: {
    origen_tipo: "pago" | "cobro";
    origen_id: string;
    fecha: string;
    concepto: string;
    monto: number;
    forma_pago: string; // "efectivo", "transferencia", "tarjeta"
    sentido: "cobro" | "pago";
  }
): Promise<{ ok: boolean; error?: string; asiento_id?: string }> {
  const cfg = await getConfig(sb, empresaId);
  if (!cfg) return { ok: false, error: "Config contable no encontrada." };
  const cuentaTes =
    params.forma_pago === "efectivo" || params.forma_pago === "caja"
      ? cfg.cuenta_caja
      : cfg.cuenta_banco;
  if (!cuentaTes) return { ok: false, error: "Falta cuenta caja o bancos." };

  const contrapartida = params.sentido === "cobro" ? cfg.cuenta_clientes : cfg.cuenta_proveedores;
  if (!contrapartida) return { ok: false, error: "Falta cuenta clientes o proveedores." };

  const lineas: LineaAsiento[] =
    params.sentido === "cobro"
      ? [
          { cuenta_id: cuentaTes,     debe: params.monto, haber: 0,             descripcion: params.concepto },
          { cuenta_id: contrapartida, debe: 0,             haber: params.monto, descripcion: params.concepto },
        ]
      : [
          { cuenta_id: contrapartida, debe: params.monto, haber: 0,             descripcion: params.concepto },
          { cuenta_id: cuentaTes,     debe: 0,             haber: params.monto, descripcion: params.concepto },
        ];

  const res = await crearAsiento(sb, empresaId, {
    fecha: params.fecha,
    concepto: params.concepto,
    origen_tipo: params.origen_tipo,
    origen_id: params.origen_id,
    lineas,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, asiento_id: res.id };
}
