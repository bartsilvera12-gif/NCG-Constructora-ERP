-- =============================================================================
-- Sprint 1 · FASE A — Ficha del empleado extendida
--
-- Aditivo. Conserva las columnas existentes `activo` (boolean) y
-- `tipos_empleado` (text[]) sin cambios: los usa el resto del sistema (nómina,
-- listados). Agrega en paralelo:
--   * estado: enum textual con CHECK; refleja el ciclo de vida real
--     (activo | baja | suspendido | pendiente).
--   * tipo_contrato / jornada_laboral: texto libre + catálogos opcionales.
--   * contacto_emergencia_*
--   * observaciones internas (texto largo)
--   * created_by (usuario que dio de alta al empleado)
--
-- Backfill: estado='activo' donde activo=true, 'baja' donde activo=false y
-- fecha_baja NO nula, 'pendiente' donde activo=false y fecha_baja nula.
--
-- Sin cambios de RLS.
-- =============================================================================

ALTER TABLE ncgconstructora.empleados
  ADD COLUMN IF NOT EXISTS estado                             text,
  ADD COLUMN IF NOT EXISTS tipo_contrato                      text,
  ADD COLUMN IF NOT EXISTS jornada_laboral                    text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre         text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono       text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_parentesco     text,
  ADD COLUMN IF NOT EXISTS observaciones                      text,
  ADD COLUMN IF NOT EXISTS created_by                         uuid;

-- Backfill idempotente: sólo pisa `estado` cuando esté nulo
UPDATE ncgconstructora.empleados
   SET estado = CASE
                  WHEN activo = true                    THEN 'activo'
                  WHEN activo = false AND fecha_baja IS NOT NULL THEN 'baja'
                  ELSE 'pendiente'
                END
 WHERE estado IS NULL;

-- CHECK aditivo (sólo si no existe). No pone NOT NULL para permitir migraciones
-- retroactivas en filas viejas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'empleados_estado_chk'
      AND conrelid = 'ncgconstructora.empleados'::regclass
  ) THEN
    ALTER TABLE ncgconstructora.empleados
      ADD CONSTRAINT empleados_estado_chk
      CHECK (estado IS NULL OR estado IN ('activo','baja','suspendido','pendiente'));
  END IF;
END$$;

COMMENT ON COLUMN ncgconstructora.empleados.estado IS
  'Ciclo de vida detallado. Complementa a `activo`; el resto del sistema sigue leyendo `activo` para filtros de listado.';
COMMENT ON COLUMN ncgconstructora.empleados.tipo_contrato IS
  'Tipo de contrato en formato libre (ej. indefinido, temporal, obra o servicio). Sin catálogo forzado.';
COMMENT ON COLUMN ncgconstructora.empleados.jornada_laboral IS
  'Jornada laboral en formato libre (ej. completa, parcial 30h, turnos).';
COMMENT ON COLUMN ncgconstructora.empleados.created_by IS
  'auth.uid() del usuario que creó el registro (informativo, no FK dura para tolerar cambios en catálogo de usuarios).';
