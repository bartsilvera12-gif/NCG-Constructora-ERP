-- =============================================================================
-- Sprint 3 · FASE I — Hoja de compra imprimible
--
-- Modelo mínimo: una solicitud (cabecera) con N items. La solicitud puede
-- vincularse a una obra/proyecto y a un empleado autorizado. Persistida en
-- schema ncgconstructora — módulo Compras (no RRHH).
--
-- Estados: borrador → autorizado → comprado → facturado (o cancelado).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ncgconstructora.solicitudes_compra (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL,
  -- Número correlativo por empresa (se genera vía secuencia en app)
  numero              text NOT NULL,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  -- Relaciones opcionales (FK lax: SET NULL si se elimina el destino)
  proyecto_id         uuid REFERENCES ncgconstructora.proyectos(id) ON DELETE SET NULL,
  empleado_id         uuid REFERENCES ncgconstructora.empleados(id) ON DELETE SET NULL,
  proveedor_id        uuid,   -- provisional; los proveedores viven en public en este tenant
  -- Snapshots para PDF estable
  empresa_nombre_snapshot   text,
  empresa_nif_snapshot      text,
  proyecto_nombre_snapshot  text,
  empleado_nombre_snapshot  text,
  proveedor_nombre_snapshot text,

  observaciones       text,
  total_estimado      numeric NOT NULL DEFAULT 0,

  estado              text NOT NULL DEFAULT 'borrador',

  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT solicitudes_compra_estado_chk
    CHECK (estado IN ('borrador','autorizado','comprado','facturado','cancelado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_compra_numero_uq
  ON ncgconstructora.solicitudes_compra (empresa_id, numero);

CREATE INDEX IF NOT EXISTS solicitudes_compra_fecha_idx
  ON ncgconstructora.solicitudes_compra (empresa_id, fecha DESC);

COMMENT ON TABLE ncgconstructora.solicitudes_compra IS
  'Hoja de compra / solicitud de compra. Puede imprimirse en PDF para llevar al proveedor.';

-- ---- Items ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ncgconstructora.solicitudes_compra_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id      uuid NOT NULL REFERENCES ncgconstructora.solicitudes_compra(id) ON DELETE CASCADE,
  empresa_id         uuid NOT NULL,
  orden              integer NOT NULL DEFAULT 0,
  descripcion        text NOT NULL,
  cantidad           numeric NOT NULL DEFAULT 1,
  unidad             text,
  precio_estimado    numeric,
  observaciones      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitudes_compra_items_desc_chk CHECK (length(trim(descripcion)) > 0),
  CONSTRAINT solicitudes_compra_items_cantidad_chk CHECK (cantidad > 0)
);

CREATE INDEX IF NOT EXISTS solicitudes_compra_items_solic_idx
  ON ncgconstructora.solicitudes_compra_items (solicitud_id, orden);
