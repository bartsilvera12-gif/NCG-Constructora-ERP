-- =============================================================================
-- Sprint 3 · FASE H — Vacaciones: días empresa vs empleado
--
-- Regla de la empresa NCG (España): 30 días naturales anuales, 15 elegidos por
-- la empresa y 15 solicitados por el empleado. Configurable por convenio.
--
-- Cambios aditivos:
--   * rrhh_politica_vacaciones: sumar `dias_empresa` y `dias_empleado`
--     (numéricos, nullables). El total sigue leyéndose desde `dias_anuales`.
--   * empleado_vacaciones: sumar `origen` (empresa | empleado), con backfill
--     a 'empleado' para todos los registros existentes.
--
-- Sin cambios en enums existentes ni en estados.
-- =============================================================================

-- Política
ALTER TABLE ncgconstructora.rrhh_politica_vacaciones
  ADD COLUMN IF NOT EXISTS dias_empresa   integer,
  ADD COLUMN IF NOT EXISTS dias_empleado  integer;

COMMENT ON COLUMN ncgconstructora.rrhh_politica_vacaciones.dias_empresa IS
  'Días del total anual que puede fijar la empresa (default España: 15). NULL = no aplica.';
COMMENT ON COLUMN ncgconstructora.rrhh_politica_vacaciones.dias_empleado IS
  'Días del total anual que puede elegir el empleado (default España: 15). NULL = no aplica.';

-- Empleado vacaciones · origen
ALTER TABLE ncgconstructora.empleado_vacaciones
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'empleado';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empleado_vacaciones_origen_chk'
  ) THEN
    ALTER TABLE ncgconstructora.empleado_vacaciones
      ADD CONSTRAINT empleado_vacaciones_origen_chk
      CHECK (origen IN ('empresa','empleado'));
  END IF;
END$$;

COMMENT ON COLUMN ncgconstructora.empleado_vacaciones.origen IS
  'Quién definió estos días: empresa (fijados por RRHH) vs empleado (solicitud). Usado para saldo desglosado.';
