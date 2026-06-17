-- =============================================================================
-- Herramientas: condición al alta + estado operativo + campos de adquisición.
--
-- Reemplaza el modelo simple `estado_herramienta` (nueva/usada) por dos
-- conceptos claros:
--   - condicion_alta: cómo entró al inventario (nueva / usada / reacondicionada).
--     Inmutable post-alta. Define qué campos cargó el usuario al darla de alta.
--   - estado_operativo: qué está pasando con la herramienta ahora
--     (disponible / asignada / en_mantenimiento / baja). Cambia durante el uso.
--
-- Aditiva e idempotente. Backfill desde estado_herramienta para no perder
-- info: cualquier fila con estado_herramienta='usada' queda como condicion_alta
-- 'usada', el resto queda 'nueva'. Materiales no se tocan.
--
-- Instancia dedicada NCG (schema único: ncgconstructora).
-- =============================================================================

ALTER TABLE ncgconstructora.productos
  ADD COLUMN IF NOT EXISTS condicion_alta            text,
  ADD COLUMN IF NOT EXISTS estado_operativo          text,
  ADD COLUMN IF NOT EXISTS fecha_compra              date,
  ADD COLUMN IF NOT EXISTS proveedor_id              uuid,
  ADD COLUMN IF NOT EXISTS proveedor_nombre          text,
  ADD COLUMN IF NOT EXISTS costo_adquisicion         numeric,
  ADD COLUMN IF NOT EXISTS numero_comprobante        text,
  ADD COLUMN IF NOT EXISTS garantia                  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS garantia_fin              date,
  ADD COLUMN IF NOT EXISTS vida_util_estimada_meses  integer,
  ADD COLUMN IF NOT EXISTS vida_util_restante_meses  integer,
  ADD COLUMN IF NOT EXISTS procedencia               text,
  ADD COLUMN IF NOT EXISTS condicion_actual          text,
  ADD COLUMN IF NOT EXISTS requiere_mantenimiento_inicial boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_reacondicionamiento date,
  ADD COLUMN IF NOT EXISTS costo_reacondicionamiento numeric,
  ADD COLUMN IF NOT EXISTS herramienta_observacion   text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_condicion_alta_check') THEN
    ALTER TABLE ncgconstructora.productos
      ADD CONSTRAINT productos_condicion_alta_check
      CHECK (condicion_alta IS NULL OR condicion_alta IN ('nueva','usada','reacondicionada'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_estado_operativo_check') THEN
    ALTER TABLE ncgconstructora.productos
      ADD CONSTRAINT productos_estado_operativo_check
      CHECK (estado_operativo IS NULL OR estado_operativo IN ('disponible','asignada','en_mantenimiento','baja'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_procedencia_check') THEN
    ALTER TABLE ncgconstructora.productos
      ADD CONSTRAINT productos_procedencia_check
      CHECK (procedencia IS NULL OR procedencia IN ('compra_usada','ya_existia','otra'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_condicion_actual_check') THEN
    ALTER TABLE ncgconstructora.productos
      ADD CONSTRAINT productos_condicion_actual_check
      CHECK (condicion_actual IS NULL OR condicion_actual IN ('buena','regular','requiere_revision'));
  END IF;
END $$;

-- Backfill desde la columna anterior (estado_herramienta) para preservar info
-- de filas existentes. Solo aplica a herramientas. Materiales quedan en NULL.
UPDATE ncgconstructora.productos
   SET condicion_alta = CASE
                          WHEN estado_herramienta = 'usada' THEN 'usada'
                          WHEN estado_herramienta = 'nueva' THEN 'nueva'
                          ELSE 'nueva'
                        END
 WHERE tipo_inventario = 'herramienta'
   AND condicion_alta IS NULL;

-- Backfill de estado_operativo para herramientas existentes: si quedan stock
-- positivo en cantidad_asignada o cantidad_mantenimiento, derivamos; si no,
-- queda 'disponible'.
UPDATE ncgconstructora.productos
   SET estado_operativo = CASE
                            WHEN cantidad_mantenimiento IS NOT NULL AND cantidad_mantenimiento > 0
                              THEN 'en_mantenimiento'
                            WHEN cantidad_asignada IS NOT NULL AND cantidad_asignada > 0
                              THEN 'asignada'
                            ELSE 'disponible'
                          END
 WHERE tipo_inventario = 'herramienta'
   AND estado_operativo IS NULL;

CREATE INDEX IF NOT EXISTS ix_productos_condicion_alta
  ON ncgconstructora.productos (empresa_id, tipo_inventario, condicion_alta);

CREATE INDEX IF NOT EXISTS ix_productos_estado_operativo
  ON ncgconstructora.productos (empresa_id, tipo_inventario, estado_operativo);
