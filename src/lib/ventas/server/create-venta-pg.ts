import { createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";

export interface CreateVentaItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_venta_original: number;
  precio_venta: number;
  tipo_iva: "EXENTA" | "4%" | "5%" | "10%" | "21%";
  /** Tipo de precio aplicado en la línea. Default 'minorista'. */
  tipo_precio: "minorista" | "mayorista" | "costo";
  subtotal: number;
  monto_iva: number;
  total_linea: number;
  /** Tipo de partida: 'producto' usa inventario; el resto son líneas manuales del presupuesto. */
  tipo_partida?: string;
  /** Descripción libre (obligatoria en partidas manuales sin producto_id). */
  descripcion?: string;
}

export interface CreateVentaPedidoCocinaInput {
  /**
   * Modalidad del pedido. Solo aplica en vertical gastronomía (En lo de Mari).
   * En distribuidora / verticales no-gastronómicas viene como `null` — el
   * pedido se crea en el kanban con título genérico, sin info de mesa/delivery.
   */
  modalidad: "local" | "delivery" | "carry_out" | null;
  mesa: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  direccion_entrega: string | null;
  observacion: string | null;
}

export interface CreateVentaPgParams {
  schema: string;
  empresaId: string;
  clienteId: string | null;
  observaciones: string | null;
  moneda: "GS" | "USD";
  tipoCambio: number;
  tipoVenta: "CONTADO" | "CREDITO";
  plazoDias: number | null;
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | null;
  items: CreateVentaItemInput[];
  subtotalDeclarado: number;
  montoIvaDeclarado: number;
  totalDeclarado: number;
  pedidoCocina?: CreateVentaPedidoCocinaInput | null;
  /** Atribución del movimiento de inventario (columna "Usuario"). */
  usuarioCatalogId?: string | null;
  usuarioNombre?: string | null;
  /**
   * Documento a generar: 'venta' (default) o 'presupuesto'.
   * En 'presupuesto':
   *  - se setea tipo_documento='presupuesto' y estado_presupuesto='pendiente'
   *  - NO se valida stock
   *  - NO se descuenta stock
   *  - NO se generan movimientos de inventario
   *  - NO se crea pedido cocina
   */
  tipoDocumento?: "venta" | "presupuesto";
  /**
   * Metadata de obra (titulo, ubicación, partidas manuales, etc.).
   * Se persiste en `ventas.presupuesto_meta` tanto para presupuestos como para
   * ventas de obra (tipo_documento='venta' con meta cargada), porque
   * /api/ventas/[id]/convertir-obra usa esta meta para crear el proyecto.
   */
  presupuestoMeta?: Record<string, unknown> | null;
}

function recalcTotals(items: CreateVentaItemInput[]) {
  let subtotal = 0;
  let montoIva = 0;
  let total = 0;
  for (const it of items) {
    subtotal += it.subtotal;
    montoIva += it.monto_iva;
    total += it.total_linea;
  }
  return { subtotal, montoIva, total };
}

const TOL = 2;

/**
 * Crea venta + ítems + movimientos + descuenta stock vía PostgREST/service-role.
 * Sin pool PG directo → compatible con Hostinger Node.js App.
 *
 * Atomicidad: PostgREST no expone transacciones multi-statement. Se hace best-effort:
 * si algún paso post-venta falla, se intenta rollback eliminando venta+items creados.
 * Para una instancia gastronómica de bajo volumen es aceptable.
 *
 * Regla `controla_stock`:
 *  - true (Reventa): valida stock disponible, descuenta stock, genera movimiento.
 *  - false (Menú): se inserta en ventas_items igual, NO valida stock, NO descuenta, NO movimiento.
 */
export async function createVentaTransaccionalPg(
  params: CreateVentaPgParams
): Promise<{ ventaId: string; numeroControl: string; fechaIso: string }> {
  const items = params.items;
  if (!items.length) {
    throw new Error("La venta debe tener al menos un ítem.");
  }

  const calc = recalcTotals(items);
  if (
    Math.abs(calc.subtotal - params.subtotalDeclarado) > TOL ||
    Math.abs(calc.montoIva - params.montoIvaDeclarado) > TOL ||
    Math.abs(calc.total - params.totalDeclarado) > TOL
  ) {
    throw new Error("Los totales no coinciden con los ítems; revisá el carrito.");
  }

  // En presupuestos pueden venir partidas manuales (mano de obra, servicio, transporte, otro)
  // sin producto_id. Solo agregamos a qtyByProduct las que sí tienen producto real.
  const qtyByProduct = new Map<string, number>();
  for (const it of items) {
    const esProductoReal = (it.tipo_partida ?? "producto") === "producto" && !!it.producto_id;
    if (!esProductoReal) continue;
    qtyByProduct.set(it.producto_id, (qtyByProduct.get(it.producto_id) ?? 0) + it.cantidad);
  }

  const sb = createServiceRoleClientWithDbSchema(params.schema);

  // 1) Cliente
  if (params.clienteId) {
    const ck = await sb.from("clientes").select("id").eq("id", params.clienteId).eq("empresa_id", params.empresaId).maybeSingle();
    if (ck.error) throw new Error(ck.error.message);
    if (!ck.data) throw new Error("Cliente no encontrado en esta empresa.");
  }

  // 2) Cargar productos del carrito — solo si hay producto_id reales.
  type ProdMeta = { stock: number; costo: number; nombre: string; sku: string; controlaStock: boolean };
  const stockMap = new Map<string, ProdMeta>();
  const ids = [...qtyByProduct.keys()];
  if (ids.length > 0) {
    const prodQ = await sb
      .from("productos")
      .select("id, stock_actual, costo_promedio, nombre, sku, controla_stock")
      .eq("empresa_id", params.empresaId)
      .in("id", ids);
    if (prodQ.error) throw new Error(prodQ.error.message);
    const prodRows = (prodQ.data ?? []) as unknown as Array<{
      id: string;
      stock_actual: number | string;
      costo_promedio: number | string;
      nombre: string;
      sku: string;
      controla_stock: boolean | null;
    }>;

    if (prodRows.length !== ids.length) {
      const found = new Set(prodRows.map((r) => r.id));
      const faltantes = ids.filter((id) => !found.has(id));
      throw new Error(
        `Uno o más productos no existen o no pertenecen a esta empresa. IDs no encontrados: ${faltantes.join(", ")}`
      );
    }
    for (const r of prodRows) {
      stockMap.set(r.id, {
        stock: Number(r.stock_actual),
        costo: Number(r.costo_promedio),
        nombre: r.nombre,
        sku: r.sku,
        controlaStock: r.controla_stock !== false,
      });
    }
  }

  const esPresupuesto = params.tipoDocumento === "presupuesto";

  // 3) Validar stock SOLO para productos que controlan stock (Reventa). Skip si es presupuesto.
  if (!esPresupuesto) {
    for (const [pid, need] of qtyByProduct) {
      const p = stockMap.get(pid)!;
      if (!p.controlaStock) continue;
      if (p.stock < need) {
        throw new Error(`Stock insuficiente para "${p.nombre}". Disponible: ${p.stock} u.; requerido: ${need}.`);
      }
    }
  }

  // 4) Numero control VTA-XXXXXX (best-effort: race posible en entorno multi-usuario).
  const maxQ = await sb
    .from("ventas")
    .select("numero_control")
    .eq("empresa_id", params.empresaId)
    .like("numero_control", "VTA-%")
    .order("numero_control", { ascending: false })
    .limit(1);
  if (maxQ.error) throw new Error(maxQ.error.message);
  let nextNum = 1;
  const lastNum = (maxQ.data?.[0] as { numero_control?: string } | undefined)?.numero_control;
  if (lastNum) {
    const m = lastNum.match(/^VTA-(\d+)$/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  const numeroControl = `VTA-${String(nextNum).padStart(6, "0")}`;
  const fechaIso = new Date().toISOString();

  // 5) Insertar venta (presupuesto vs venta real difieren en estado, tipo_documento)
  const insVenta = await sb
    .from("ventas")
    .insert({
      empresa_id: params.empresaId,
      cliente_id: params.clienteId,
      numero_control: numeroControl,
      moneda: params.moneda,
      tipo_cambio: params.tipoCambio,
      subtotal: calc.subtotal,
      monto_iva: calc.montoIva,
      total: calc.total,
      estado: esPresupuesto ? "borrador" : "completada",
      tipo_venta: params.tipoVenta,
      plazo_dias: params.plazoDias,
      metodo_pago: params.metodoPago,
      fecha: fechaIso,
      observaciones: params.observaciones,
      tipo_documento: esPresupuesto ? "presupuesto" : "venta",
      estado_presupuesto: esPresupuesto ? "pendiente" : null,
      presupuesto_meta: params.presupuestoMeta ?? null,
      // CONTADO: se cobra al instante; CREDITO/presupuesto: queda pendiente.
      monto_cobrado: !esPresupuesto && params.tipoVenta === "CONTADO" ? calc.total : 0,
      fecha_cobro: !esPresupuesto && params.tipoVenta === "CONTADO" ? fechaIso : null,
    })
    .select("id")
    .single();
  if (insVenta.error) throw new Error(insVenta.error.message);
  const ventaId = String((insVenta.data as { id: string }).id);

  // Helper de rollback best-effort
  const rollback = async () => {
    try {
      await sb.from("movimientos_inventario").delete().eq("venta_id", ventaId).eq("empresa_id", params.empresaId);
    } catch {}
    try {
      await sb.from("ventas_items").delete().eq("venta_id", ventaId).eq("empresa_id", params.empresaId);
    } catch {}
    try {
      await sb.from("ventas").delete().eq("id", ventaId).eq("empresa_id", params.empresaId);
    } catch {}
  };

  try {
    // 6) Insertar items (bulk). Partidas manuales: producto_id null + descripcion.
    const itemsRows = items.map((line) => {
      const tipo_partida = line.tipo_partida ?? "producto";
      return {
        empresa_id: params.empresaId,
        venta_id: ventaId,
        producto_id: tipo_partida === "producto" && line.producto_id ? line.producto_id : null,
        producto_nombre: line.producto_nombre || (line.descripcion ?? ""),
        sku: line.sku ?? "",
        cantidad: line.cantidad,
        precio_venta_original: line.precio_venta_original,
        precio_venta: line.precio_venta,
        tipo_iva: line.tipo_iva,
        tipo_precio: line.tipo_precio ?? "minorista",
        subtotal: line.subtotal,
        monto_iva: line.monto_iva,
        total_linea: line.total_linea,
        tipo_partida,
        descripcion: line.descripcion ?? null,
      };
    });
    const insItems = await sb.from("ventas_items").insert(itemsRows);
    if (insItems.error) throw new Error(insItems.error.message);

    // 7) Descuento de stock + movimientos solo para productos con controla_stock=true.
    //    Para presupuestos NO se toca stock ni se crean movimientos.
    if (!esPresupuesto) {
      for (const line of items) {
        if ((line.tipo_partida ?? "producto") !== "producto" || !line.producto_id) continue;
        const p = stockMap.get(line.producto_id)!;
        if (!p.controlaStock) continue;
        const nuevoStock = p.stock - line.cantidad;
        const upd = await sb
          .from("productos")
          .update({ stock_actual: nuevoStock })
          .eq("id", line.producto_id)
          .eq("empresa_id", params.empresaId);
        if (upd.error) throw new Error(upd.error.message);
        p.stock = nuevoStock;

        const mov = await sb.from("movimientos_inventario").insert({
          empresa_id: params.empresaId,
          producto_id: line.producto_id,
          producto_nombre: line.producto_nombre,
          producto_sku: line.sku,
          tipo: "SALIDA",
          cantidad: line.cantidad,
          costo_unitario: p.costo,
          origen: "venta",
          referencia: numeroControl,
          fecha: fechaIso,
          venta_id: ventaId,
          created_by: params.usuarioCatalogId ?? null,
          usuario_nombre: params.usuarioNombre ?? null,
        });
        if (mov.error) throw new Error(mov.error.message);
      }
    }

    // 8) Pedido cocina (tarjeta en proyectos). No aplica a presupuestos.
    if (params.pedidoCocina && !esPresupuesto) {
      const tipoQ = await sb
        .from("proyecto_tipos")
        .select("id")
        .eq("empresa_id", params.empresaId)
        .eq("codigo", "pedido")
        .eq("activo", true)
        .limit(1)
        .maybeSingle();
      if (tipoQ.error) throw new Error(tipoQ.error.message);
      if (!tipoQ.data) throw new Error("Tipo de proyecto 'pedido' no configurado para esta empresa.");
      const tipoId = (tipoQ.data as { id: string }).id;

      const estadoQ = await sb
        .from("proyecto_estados")
        .select("id")
        .eq("empresa_id", params.empresaId)
        .eq("codigo", "nuevo")
        .eq("activo", true)
        .limit(1)
        .maybeSingle();
      if (estadoQ.error) throw new Error(estadoQ.error.message);
      if (!estadoQ.data) throw new Error("Estado 'nuevo' no configurado para esta empresa.");
      const estadoId = (estadoQ.data as { id: string }).id;

      const itemsSnapshot = items.map((it) => ({
        producto_id: it.producto_id,
        producto_nombre: it.producto_nombre,
        sku: it.sku,
        cantidad: it.cantidad,
        precio_venta: it.precio_venta,
        total_linea: it.total_linea,
      }));
      const briefData = {
        modalidad: params.pedidoCocina.modalidad,
        mesa: params.pedidoCocina.mesa,
        cliente_nombre: params.pedidoCocina.cliente_nombre,
        cliente_telefono: params.pedidoCocina.cliente_telefono,
        direccion_entrega: params.pedidoCocina.direccion_entrega,
        observacion: params.pedidoCocina.observacion,
        items: itemsSnapshot,
        venta_id: ventaId,
        numero_control: numeroControl,
        fecha_iso: fechaIso,
      };
      const metadata = {
        source: "venta",
        venta_id: ventaId,
        numero_control: numeroControl,
        modalidad: params.pedidoCocina.modalidad,
      };
      // Si modalidad es null (distribuidora) → título sólo "Venta {numero}".
      // Si tiene modalidad (gastronomía) → "Venta {numero} · {Modalidad}[ · Mesa N | · Cliente]".
      const mod = params.pedidoCocina.modalidad;
      const tituloModalidad =
        mod === "local" ? "Local"
        : mod === "delivery" ? "Delivery"
        : mod === "carry_out" ? "Retiro"
        : null;
      const detalle =
        mod === "local" && params.pedidoCocina.mesa
          ? ` · Mesa ${params.pedidoCocina.mesa}`
          : mod === "delivery" && params.pedidoCocina.cliente_nombre
          ? ` · ${params.pedidoCocina.cliente_nombre}`
          : "";
      const titulo = tituloModalidad
        ? `Venta ${numeroControl} · ${tituloModalidad}${detalle}`.slice(0, 200)
        : `Venta ${numeroControl}`.slice(0, 200);

      const insProy = await sb.from("proyectos").insert({
        empresa_id: params.empresaId,
        cliente_id: params.clienteId,
        tipo_id: tipoId,
        estado_id: estadoId,
        titulo,
        prioridad: "normal",
        monto_vendido: params.totalDeclarado,
        fecha_ingreso: fechaIso,
        brief_data: briefData,
        metadata,
      });
      if (insProy.error) throw new Error(insProy.error.message);
    }

    return { ventaId, numeroControl, fechaIso };
  } catch (err) {
    await rollback();
    throw err;
  }
}
