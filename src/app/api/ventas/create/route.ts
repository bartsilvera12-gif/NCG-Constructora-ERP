import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { createVentaTransaccionalPg } from "@/lib/ventas/server/create-venta-pg";
import type { CreateVentaItemInput } from "@/lib/ventas/server/create-venta-pg";
import { insertVentaPagoDetalle, type PagoDetalleInput } from "@/lib/ventas/server/pago-detalle-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { Venta, LineaVenta } from "@/lib/ventas/types";

const TIPO_PARTIDA_OK = new Set([
  "producto", "mano_obra", "servicio", "transporte",
  "alquiler_equipo", "retiro_escombros", "seguridad_andamio", "limpieza_final",
  "otro",
]);
// Tipos del catálogo que la CHECK constraint vieja de la BD aún no acepta.
// Hasta correr la migración 20260619200000, los mapeamos a "otro" para no
// romper el insert. Una vez aplicada la migración esta lista puede quedar
// vacía (no rompe nada dejarla).
const TIPO_PARTIDA_LEGACY_FALLBACK = new Set([
  "alquiler_equipo", "retiro_escombros", "seguridad_andamio", "limpieza_final",
]);

type ItemsErr = { ok: false; error: string };
type ItemsOk = { ok: true; items: CreateVentaItemInput[] };
function asItems(body: unknown, esPresupuesto: boolean): ItemsOk | ItemsErr {
  if (!body || typeof body !== "object") return { ok: false, error: "body invalido" };
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return { ok: false, error: "items debe ser un arreglo" };
  if (raw.length === 0) {
    return esPresupuesto ? { ok: true, items: [] } : { ok: false, error: "La venta debe tener al menos un item" };
  }
  const out: CreateVentaItemInput[] = [];
  for (let idx = 0; idx < raw.length; idx++) {
    const x = raw[idx];
    if (!x || typeof x !== "object") return { ok: false, error: `Item ${idx + 1}: formato invalido` };
    const r = x as Record<string, unknown>;
    // tipo_iva: si llega vacío o sin "%" lo casteamos al 21% (default ES).
    const rawIva = typeof r.tipo_iva === "string" ? r.tipo_iva.trim().toUpperCase() : "";
    const tipoIva: "EXENTA" | "4%" | "5%" | "10%" | "21%" =
      rawIva === "EXENTA" ? "EXENTA"
      : rawIva === "4%" || rawIva === "4" ? "4%"
      : rawIva === "5%" || rawIva === "5" ? "5%"
      : rawIva === "10%" || rawIva === "10" ? "10%"
      : "21%";
    const tp = r.tipo_precio;
    const tipoPrecio: "minorista" | "mayorista" | "costo" =
      tp === "mayorista" || tp === "costo" ? tp : "minorista";
    const tipoPartidaRaw = typeof r.tipo_partida === "string" ? r.tipo_partida : "producto";
    let tipo_partida = TIPO_PARTIDA_OK.has(tipoPartidaRaw) ? tipoPartidaRaw : "producto";
    // Workaround: tipos nuevos del form aún no aceptados por la CHECK de la BD.
    if (TIPO_PARTIDA_LEGACY_FALLBACK.has(tipo_partida)) tipo_partida = "otro";
    const descripcion = typeof r.descripcion === "string" ? r.descripcion.trim() : "";
    out.push({
      producto_id: String(r.producto_id ?? ""),
      producto_nombre: String(r.producto_nombre ?? ""),
      sku: String(r.sku ?? ""),
      cantidad: Number(r.cantidad),
      precio_venta_original: Number(r.precio_venta_original),
      precio_venta: Number(r.precio_venta),
      tipo_iva: tipoIva,
      tipo_precio: tipoPrecio,
      subtotal: Number(r.subtotal),
      monto_iva: Number(r.monto_iva),
      total_linea: Number(r.total_linea),
      tipo_partida,
      descripcion,
    });
  }
  // Validacion por item: cantidad > 0 y (producto_id O descripcion).
  for (let idx = 0; idx < out.length; idx++) {
    const i = out[idx];
    if (!(i.cantidad > 0)) {
      return { ok: false, error: `Item ${idx + 1} ("${i.producto_nombre || i.descripcion || "sin nombre"}"): cantidad invalida` };
    }
    if (i.tipo_partida === "producto") {
      if (!i.producto_id) {
        return { ok: false, error: `Item ${idx + 1} ("${i.producto_nombre || "producto"}"): producto_id requerido` };
      }
    } else {
      if (!i.descripcion && !i.producto_nombre) {
        return { ok: false, error: `Item ${idx + 1}: la partida manual necesita descripcion` };
      }
    }
  }
  return { ok: true, items: out };
}

function toVentaResponse(
  items: CreateVentaItemInput[],
  meta: {
    id: string;
    numero_control: string;
    fechaIso: string;
    moneda: Venta["moneda"];
    tipo_cambio: number;
    tipo_venta: Venta["tipo_venta"];
    plazo_dias?: number;
    metodo_pago?: Venta["metodo_pago"];
    subtotal: number;
    monto_iva: number;
    total: number;
  }
): Venta {
  const lineas: LineaVenta[] = items.map((i) => ({
    producto_id: i.producto_id,
    producto_nombre: i.producto_nombre,
    sku: i.sku,
    cantidad: i.cantidad,
    precio_venta_original: i.precio_venta_original,
    precio_venta: i.precio_venta,
    tipo_iva: i.tipo_iva,
    tipo_precio: i.tipo_precio,
    subtotal: i.subtotal,
    monto_iva: i.monto_iva,
    total_linea: i.total_linea,
  }));
  return {
    id: meta.id,
    numero_control: meta.numero_control,
    items: lineas,
    moneda: meta.moneda,
    tipo_cambio: meta.tipo_cambio,
    subtotal: meta.subtotal,
    monto_iva: meta.monto_iva,
    total: meta.total,
    tipo_venta: meta.tipo_venta,
    plazo_dias: meta.plazo_dias,
    metodo_pago: meta.metodo_pago,
    fecha: meta.fechaIso,
  };
}

/**
 * POST /api/ventas/create — venta + ítems + stock + movimientos (una transacción Postgres).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const oTmp = body as Record<string, unknown>;
    const esPresupuesto = String(oTmp.tipo_documento ?? "").toLowerCase() === "presupuesto";
    const itemsResult = asItems(body, esPresupuesto);
    if (!itemsResult.ok) {
      return NextResponse.json(errorResponse(`Payload invalido: ${itemsResult.error}`), { status: 400 });
    }
    const items = itemsResult.items;

    const o = oTmp;
    const moneda = o.moneda === "USD" ? "USD" : "GS";
    const tipoCambio = Number(o.tipo_cambio) || 1;
    const tipoVenta = o.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO";
    const plazoDias =
      tipoVenta === "CREDITO" && o.plazo_dias != null && String(o.plazo_dias).trim() !== ""
        ? parseInt(String(o.plazo_dias), 10)
        : null;
    const metodoPago: "efectivo" | "tarjeta" | "transferencia" =
      o.metodo_pago === "tarjeta" || o.metodo_pago === "transferencia" ? o.metodo_pago : "efectivo";

    // Detalle de pago (conciliación entre cuentas). Obligatorio para transferencia/tarjeta.
    let pagoDetalle: PagoDetalleInput | null = null;
    if (metodoPago === "transferencia" || metodoPago === "tarjeta") {
      const pd = (o.pago_detalle ?? null) as Record<string, unknown> | null;
      if (!pd || typeof pd !== "object") {
        return NextResponse.json(
          errorResponse("Faltan los datos de la transferencia/tarjeta para la conciliación."),
          { status: 400 }
        );
      }
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const bancoNombre = str(pd.banco_nombre);
      const titular = str(pd.titular);
      const nroComprobante = str(pd.nro_comprobante);
      const bancoCodigo = str(pd.banco_codigo) || null;
      const monto = Number(pd.monto);
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const entidadRaw = str(pd.entidad_bancaria_id);
      const entidadBancariaId = UUID_RE.test(entidadRaw) ? entidadRaw : null;

      if (!bancoNombre) {
        return NextResponse.json(errorResponse("Indicá el banco (por código o nombre)."), { status: 400 });
      }
      if (metodoPago === "transferencia" && !titular) {
        return NextResponse.json(errorResponse("Ingresá el titular que envía la transferencia."), { status: 400 });
      }
      if (!(monto > 0)) {
        return NextResponse.json(errorResponse("El monto del pago debe ser mayor a 0."), { status: 400 });
      }
      if (!nroComprobante) {
        return NextResponse.json(errorResponse("Ingresá el N° de comprobante."), { status: 400 });
      }
      pagoDetalle = {
        metodoPago,
        entidadBancariaId,
        bancoCodigo,
        bancoNombre,
        titular: metodoPago === "transferencia" ? titular : null,
        monto: Math.round(monto),
        nroComprobante,
      };
    }
    const clienteRaw = o.cliente_id;
    const clienteId =
      clienteRaw === null || clienteRaw === undefined || clienteRaw === ""
        ? null
        : String(clienteRaw);
    const observaciones =
      o.observaciones === null || o.observaciones === undefined
        ? null
        : String(o.observaciones).slice(0, 4000);

    // Pedido de cocina / proyecto-kanban.
    // - En gastronomía (En lo de Mari): modalidad obligatoria (local|delivery|carry_out).
    // - En distribuidora / no-gastronomía: modalidad = null. Igual se crea el pedido
    //   en el kanban (estado "Nuevo") como tarjeta de seguimiento de la venta.
    const pedidoRaw = (o.pedido_cocina ?? null) as Record<string, unknown> | null;
    type PedidoCocinaParsed = {
      modalidad: "local" | "delivery" | "carry_out" | null;
      mesa: string | null;
      cliente_nombre: string | null;
      cliente_telefono: string | null;
      direccion_entrega: string | null;
      observacion: string | null;
    };
    let pedidoCocina: PedidoCocinaParsed | null = null;
    if (pedidoRaw && typeof pedidoRaw === "object") {
      const m = pedidoRaw.modalidad;
      // Modalidad puede ser null/undefined (distribuidora) o uno de los 3 valores
      // de gastronomía. Cualquier otro string es rechazado.
      let modalidadParsed: "local" | "delivery" | "carry_out" | null;
      if (m === null || m === undefined) {
        modalidadParsed = null;
      } else if (m === "local" || m === "delivery" || m === "carry_out") {
        modalidadParsed = m;
      } else {
        return NextResponse.json(
          errorResponse("Modalidad de pedido inválida (local | delivery | carry_out | null)."),
          { status: 400 }
        );
      }
      const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const mesa = trim(pedidoRaw.mesa);
      const cliNombre = trim(pedidoRaw.cliente_nombre);
      const cliTel = trim(pedidoRaw.cliente_telefono);
      const direccion = trim(pedidoRaw.direccion_entrega);
      const obs = trim(pedidoRaw.observacion);
      // Validación específica de delivery solo aplica si efectivamente hay modalidad delivery.
      if (modalidadParsed === "delivery" && (cliTel.length === 0 || direccion.length === 0)) {
        return NextResponse.json(
          errorResponse("Teléfono y dirección requeridos para Delivery."),
          { status: 400 }
        );
      }
      pedidoCocina = {
        modalidad: modalidadParsed,
        mesa: mesa || null,
        cliente_nombre: cliNombre || null,
        cliente_telefono: cliTel || null,
        direccion_entrega: direccion || null,
        observacion: obs || null,
      };
    }

    const subtotalDeclarado = Number(o.subtotal);
    const montoIvaDeclarado = Number(o.monto_iva);
    const totalDeclarado = Number(o.total);

    if ([subtotalDeclarado, montoIvaDeclarado, totalDeclarado].some((n) => Number.isNaN(n))) {
      return NextResponse.json(errorResponse("Totales inválidos."), { status: 400 });
    }

    if (moneda === "USD" && tipoCambio <= 0) {
      return NextResponse.json(errorResponse("Tipo de cambio inválido para USD."), { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    const tipoDocumento: "venta" | "presupuesto" =
      String(o.tipo_documento ?? "").trim().toLowerCase() === "presupuesto" ? "presupuesto" : "venta";

    // Metadata específica del presupuesto de obra (titulo, ubicación, etc.).
    let presupuestoMeta: Record<string, unknown> | null = null;
    if (tipoDocumento === "presupuesto") {
      const pm = (o.presupuesto_meta ?? null) as Record<string, unknown> | null;
      if (pm && typeof pm === "object") {
        const trim = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);
        const num = (v: unknown) => {
          if (v == null || v === "") return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        presupuestoMeta = {
          titulo_obra: trim(pm.titulo_obra),
          tipo_obra_id: trim(pm.tipo_obra_id),
          ubicacion: trim(pm.ubicacion),
          superficie_m2: num(pm.superficie_m2),
          descripcion: trim(pm.descripcion),
          validez_dias: num(pm.validez_dias),
          condiciones: trim(pm.condiciones),
        };
      }
    }

    const { ventaId, numeroControl, fechaIso } = await createVentaTransaccionalPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      observaciones,
      moneda,
      tipoCambio,
      tipoVenta,
      plazoDias: Number.isFinite(plazoDias as number) ? plazoDias : null,
      metodoPago,
      items,
      subtotalDeclarado,
      montoIvaDeclarado,
      totalDeclarado,
      pedidoCocina,
      usuarioCatalogId: auth.usuarioCatalogId ?? null,
      usuarioNombre: auth.usuarioNombre ?? auth.user?.email ?? null,
      tipoDocumento,
      presupuestoMeta,
    });

    // Detalle de pago (transferencia/tarjeta) → ventas_pagos_detalle (raw-PG).
    // Best-effort: la venta ya quedó creada; si esto falla, se loguea pero no se
    // invalida la venta (los datos se validaron antes de crearla).
    if (pagoDetalle) {
      try {
        await insertVentaPagoDetalle(schema, auth.empresa_id, ventaId, pagoDetalle);
      } catch (e) {
        console.error(
          "[/api/ventas/create] No se pudo guardar el detalle de pago:",
          e instanceof Error ? e.message : e
        );
      }
    }

    let sub = 0;
    let iv = 0;
    let tot = 0;
    for (const it of items) {
      sub += it.subtotal;
      iv += it.monto_iva;
      tot += it.total_linea;
    }

    const venta = toVentaResponse(items, {
      id: ventaId,
      numero_control: numeroControl,
      fechaIso,
      moneda,
      tipo_cambio: tipoCambio,
      tipo_venta: tipoVenta,
      plazo_dias: tipoVenta === "CREDITO" ? plazoDias ?? undefined : undefined,
      metodo_pago: metodoPago,
      subtotal: sub,
      monto_iva: iv,
      total: tot,
    });

    return NextResponse.json(successResponse({ venta }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear la venta.";
    const status =
      msg.includes("Stock insuficiente") ||
      msg.includes("no existen") ||
      msg.includes("Cliente no encontrado") ||
      msg.includes("Totales no coinciden") ||
      msg.includes("al menos un")
        ? 400
        : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
