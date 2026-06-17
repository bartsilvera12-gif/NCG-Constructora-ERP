export type MetodoValuacion = "CPP" | "FIFO" | "LIFO";
export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE" | "ASIGNACION" | "DEVOLUCION" | "BAJA" | "MANTENIMIENTO_FIN";
export type OrigenMovimiento = "compra" | "venta" | "ajuste_manual" | "inventario_inicial";

export interface Producto {
  id: string;
  nombre: string;
  sku: string;
  costo_promedio: number;
  /** Costo unitario sin IVA de la última compra registrada. */
  ultimo_costo?: number;
  /** Herramientas: cantidad prestada/asignada a obras/responsables (no descuenta stock). */
  cantidad_asignada?: number;
  /** Herramientas: cantidad en mantenimiento (no descuenta stock). */
  cantidad_mantenimiento?: number;
  /** Precio de venta minorista (precio al público). Opcional por compat: en
   *  productos viejos se deriva de `precio_venta` en el mapeo (rowToProducto). */
  precio_minorista?: number;
  /** Precio de venta mayorista (por volumen). Opcional por compat (ver arriba). */
  precio_mayorista?: number;
  /** Espejo de `precio_minorista` por compatibilidad con código/reportes legacy. */
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string;
  metodo_valuacion: MetodoValuacion;
  /** Código de barras NUMÉRICO escaneable (EAN-13). */
  codigo_barras?: string | null;
  /** Código interno / ERP (alfanumérico, ej. INT-DIS-202606-000010). */
  codigo_interno?: string | null;
  codigo_barras_interno?: boolean;
  imagen_path?: string | null;
  imagen_url?: string | null;
  categoria_principal_id?: string | null;
  ubicacion_principal_id?: string | null;
  proveedor_principal_id?: string | null;
  /** Clasificación gastronómica: producto que se vende al cliente final. */
  es_vendible?: boolean;
  /** Clasificación gastronómica: producto usado como insumo en recetas. */
  es_insumo?: boolean;
  /** Si false, no descuenta stock (ajustes/servicios). */
  controla_stock?: boolean;
  /** Si false, no entra en valuación (combos/promos). */
  valorizado?: boolean;
  /** Unidad usada al comprar (ej. "Bolsa 25kg"). */
  unidad_compra?: string | null;
  /** Unidad usada en recetas (ej. "g"). */
  unidad_receta?: string | null;
  /** Factor para 1 unidad_compra → unidades_receta (ej. 25000). */
  factor_compra_receta?: number;
  /** Tiempo estimado de preparación en minutos (para Kanban cocina). */
  tiempo_prep_minutos?: number;
  /** Descripción detallada (visible en Menú y edición). */
  descripcion?: string | null;
  /** Clasificación NCG (constructora): material / herramienta. */
  tipo_inventario?: "material" | "herramienta";
  /** @deprecated Reemplazado por `condicion_alta`. Se mantiene leído por
   *  compatibilidad con filas legacy; las nuevas filas no lo escriben. */
  estado_herramienta?: "nueva" | "usada" | null;

  // ─── Herramientas: condición al alta + estado operativo ───────────────────
  /** Cómo entró al inventario. Inmutable post-alta. */
  condicion_alta?: "nueva" | "usada" | "reacondicionada" | null;
  /** Estado operativo actual. Cambia durante el uso. */
  estado_operativo?: "disponible" | "asignada" | "en_mantenimiento" | "baja" | null;

  // Datos de adquisición (cargados según condición)
  fecha_compra?: string | null;
  proveedor_id?: string | null;
  proveedor_nombre?: string | null;
  costo_adquisicion?: number | null;
  numero_comprobante?: string | null;
  garantia?: boolean | null;
  garantia_fin?: string | null;
  vida_util_estimada_meses?: number | null;
  vida_util_restante_meses?: number | null;

  // Usada / Reacondicionada
  /** compra_usada | ya_existia | otra */
  procedencia?: "compra_usada" | "ya_existia" | "otra" | null;
  /** buena | regular | requiere_revision */
  condicion_actual?: "buena" | "regular" | "requiere_revision" | null;
  requiere_mantenimiento_inicial?: boolean | null;

  // Reacondicionada
  fecha_reacondicionamiento?: string | null;
  costo_reacondicionamiento?: number | null;

  /** Observación libre del alta de herramienta. */
  herramienta_observacion?: string | null;
}

export interface MovimientoInventario {
  id: string;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario: number;
  origen: OrigenMovimiento;
  fecha: string;       // ISO string
  referencia?: string; // ej: "COMP-000001"
  created_by?: string | null;
  usuario_nombre?: string | null;
  /** Obra/Proyecto al que se imputa el movimiento (opcional, requerido para SALIDAS de materiales). */
  proyecto_id?: string | null;
  /** Nombre denormalizado del proyecto, lo llena el endpoint para mostrar en la lista. */
  proyecto_titulo?: string | null;
  /** Motivo de la salida (uso_obra, consumo_interno, rotura, ajuste, entrega_cuadrilla, transferencia_vehiculo). */
  motivo?: string | null;
  /** Observación libre. */
  observacion?: string | null;
  /** Ubicación de destino (para devoluciones/asignaciones). */
  ubicacion_destino?: string | null;
  /** Fecha estimada de devolución (asignaciones). */
  fecha_devolucion_estimada?: string | null;
  /** Estado al devolver: buen_estado | requiere_mantenimiento | rota. */
  estado_devolucion?: string | null;
  /** Motivo de baja: rotura | perdida | robo | obsolescencia | venta_activo. */
  motivo_baja?: string | null;
}
