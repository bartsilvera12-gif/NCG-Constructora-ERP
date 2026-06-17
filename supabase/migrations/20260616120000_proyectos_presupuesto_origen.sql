-- =============================================================================
-- Proyectos: vinculación bidireccional con el presupuesto que dio origen a la obra.
-- Instancia dedicada NCG (schema único: ncgconstructora).
-- Aditiva e idempotente. Sin tocar datos existentes.
--   - proyectos.presupuesto_origen_id     uuid null   -- venta de origen
--   - proyectos.presupuesto_origen_numero text null   -- numero_control snapshot
-- =============================================================================

ALTER TABLE ncgconstructora.proyectos
  ADD COLUMN IF NOT EXISTS presupuesto_origen_id uuid;

ALTER TABLE ncgconstructora.proyectos
  ADD COLUMN IF NOT EXISTS presupuesto_origen_numero text;

CREATE INDEX IF NOT EXISTS ix_proyectos_presupuesto_origen
  ON ncgconstructora.proyectos (empresa_id, presupuesto_origen_id);
