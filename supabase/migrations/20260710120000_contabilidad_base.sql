-- Módulo de contabilidad: plan de cuentas, config de mapeos por IVA/IRPF y
-- asientos contables (cabecera + líneas debe/haber). Adaptado a España
-- (IVA 4/10/21%, IRPF). Los asientos se generan luego automáticamente desde
-- ventas/compras/gastos/pagos.

CREATE TABLE IF NOT EXISTS ncgconstructora.plan_cuentas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  codigo       text NOT NULL,   -- "570", "430", "700", "477", "472"...
  nombre       text NOT NULL,   -- "Caja", "Clientes", "Ventas de bienes"...
  tipo         text NOT NULL CHECK (tipo IN ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto', 'orden')),
  padre_id     uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_empresa_codigo
  ON ncgconstructora.plan_cuentas (empresa_id, codigo);

COMMENT ON TABLE ncgconstructora.plan_cuentas IS
  'Plan contable por empresa. Códigos siguiendo el PGC español (opcional).';

-- Config de mapeo: qué cuentas usar para cada tipo de operación.
CREATE TABLE IF NOT EXISTS ncgconstructora.contable_config (
  empresa_id           uuid PRIMARY KEY,
  cuenta_clientes      uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,   -- 430
  cuenta_proveedores   uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,   -- 400
  cuenta_ventas        uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,   -- 700/705
  cuenta_compras       uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,   -- 600
  cuenta_gastos        uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,   -- 621/628/629
  cuenta_iva_repercutido_21  uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL, -- 477
  cuenta_iva_repercutido_10  uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,
  cuenta_iva_repercutido_4   uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,
  cuenta_iva_soportado_21    uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL, -- 472
  cuenta_iva_soportado_10    uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,
  cuenta_iva_soportado_4     uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL,
  cuenta_irpf                uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL, -- 4751/473
  cuenta_caja                uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL, -- 570
  cuenta_banco               uuid REFERENCES ncgconstructora.plan_cuentas(id) ON DELETE SET NULL, -- 572
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  updated_by                 uuid
);

COMMENT ON TABLE ncgconstructora.contable_config IS
  'Mapeo por empresa de tipos de operación a cuentas contables. Base para la generación automática de asientos.';

-- Asientos contables (cabecera).
CREATE TABLE IF NOT EXISTS ncgconstructora.asientos_contables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  numero        text NOT NULL,             -- Correlativo por empresa, ej. "2026-0001"
  fecha         date NOT NULL,
  concepto      text NOT NULL,
  origen_tipo   text CHECK (origen_tipo IN ('venta', 'compra', 'gasto', 'pago', 'cobro', 'manual', 'ajuste')),
  origen_id     uuid,                       -- id de venta/compra/gasto/pago que originó el asiento
  observacion   text,
  anulado       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  UNIQUE (empresa_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_asientos_empresa_fecha
  ON ncgconstructora.asientos_contables (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asientos_origen
  ON ncgconstructora.asientos_contables (empresa_id, origen_tipo, origen_id);

-- Líneas del asiento (debe/haber).
CREATE TABLE IF NOT EXISTS ncgconstructora.asientos_lineas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  asiento_id   uuid NOT NULL REFERENCES ncgconstructora.asientos_contables(id) ON DELETE CASCADE,
  cuenta_id    uuid NOT NULL REFERENCES ncgconstructora.plan_cuentas(id),
  debe         numeric(14, 2) NOT NULL DEFAULT 0,
  haber        numeric(14, 2) NOT NULL DEFAULT 0,
  descripcion  text,
  orden        integer NOT NULL DEFAULT 0,
  CHECK (debe >= 0 AND haber >= 0),
  CHECK (debe = 0 OR haber = 0)             -- una línea es o debe o haber, no ambos
);

CREATE INDEX IF NOT EXISTS idx_asientos_lineas_asiento
  ON ncgconstructora.asientos_lineas (asiento_id);
CREATE INDEX IF NOT EXISTS idx_asientos_lineas_cuenta
  ON ncgconstructora.asientos_lineas (empresa_id, cuenta_id);

COMMENT ON TABLE ncgconstructora.asientos_lineas IS
  'Detalle del asiento: partida doble. Suma de debe debe igualar suma de haber por asiento (verificado en aplicación).';
