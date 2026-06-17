-- =============================================================================
-- Productos: estado de herramienta (nueva / usada).
--
-- Aplica solo a productos con tipo_inventario='herramienta' (activos de obra).
-- Los materiales y otros tipos ignoran este campo. Por defecto las herramientas
-- existentes quedan como 'nueva'; se puede actualizar manualmente desde el
-- formulario de edición del producto.
--
-- Instancia dedicada NCG (schema único: ncgconstructora). Aditivo + idempotente.
-- =============================================================================

ALTER TABLE ncgconstructora.productos
  ADD COLUMN IF NOT EXISTS estado_herramienta text;

-- CHECK reservado para los valores válidos. Como la columna acepta NULL para
-- productos que no son herramientas, el constraint solo se aplica cuando hay
-- valor.
ALTER TABLE ncgconstructora.productos
  DROP CONSTRAINT IF EXISTS productos_estado_herramienta_check;

ALTER TABLE ncgconstructora.productos
  ADD CONSTRAINT productos_estado_herramienta_check
  CHECK (estado_herramienta IS NULL OR estado_herramienta IN ('nueva', 'usada'));
