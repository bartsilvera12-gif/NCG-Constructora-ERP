-- =============================================================================
-- Mano de obra por período: amplía empleado_asignaciones para soportar
-- asignaciones a obra desde una fecha hasta una fecha, con cálculo de
-- estimado vs real y estados (activa / finalizada / cancelada).
--
-- Instancia dedicada NCG (schema único: ncgconstructora).
-- Aditiva e idempotente. Sin tocar datos existentes (las filas legacy quedan
-- con modo='horas_dia' y siguen sumando en rentabilidad como antes).
-- =============================================================================

ALTER TABLE ncgconstructora.empleado_asignaciones
  ADD COLUMN IF NOT EXISTS modo                    text NOT NULL DEFAULT 'horas_dia',
  ADD COLUMN IF NOT EXISTS fecha_desde             date,
  ADD COLUMN IF NOT EXISTS fecha_hasta_estimada    date,
  ADD COLUMN IF NOT EXISTS fecha_fin_real          date,
  ADD COLUMN IF NOT EXISTS horas_por_dia           numeric,
  ADD COLUMN IF NOT EXISTS dias_trabajo_tipo       text,
  ADD COLUMN IF NOT EXISTS costo_hora_snapshot     numeric,
  ADD COLUMN IF NOT EXISTS dias_estimados          integer,
  ADD COLUMN IF NOT EXISTS horas_estimadas         numeric,
  ADD COLUMN IF NOT EXISTS costo_estimado          numeric,
  ADD COLUMN IF NOT EXISTS dias_reales             integer,
  ADD COLUMN IF NOT EXISTS horas_reales            numeric,
  ADD COLUMN IF NOT EXISTS costo_real              numeric,
  ADD COLUMN IF NOT EXISTS estado                  text NOT NULL DEFAULT 'activa',
  ADD COLUMN IF NOT EXISTS motivo_finalizacion     text,
  ADD COLUMN IF NOT EXISTS empleado_nombre_snapshot text,
  ADD COLUMN IF NOT EXISTS empleado_cargo_snapshot text,
  ADD COLUMN IF NOT EXISTS updated_at              timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'empleado_asignaciones_estado_chk'
  ) THEN
    ALTER TABLE ncgconstructora.empleado_asignaciones
      ADD CONSTRAINT empleado_asignaciones_estado_chk
      CHECK (estado IN ('activa','finalizada','cancelada'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'empleado_asignaciones_modo_chk'
  ) THEN
    ALTER TABLE ncgconstructora.empleado_asignaciones
      ADD CONSTRAINT empleado_asignaciones_modo_chk
      CHECK (modo IN ('horas_dia','periodo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'empleado_asignaciones_dias_trabajo_tipo_chk'
  ) THEN
    ALTER TABLE ncgconstructora.empleado_asignaciones
      ADD CONSTRAINT empleado_asignaciones_dias_trabajo_tipo_chk
      CHECK (dias_trabajo_tipo IS NULL OR dias_trabajo_tipo IN ('lun_vie','lun_sab','todos','manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_empleado_asig_proyecto_estado
  ON ncgconstructora.empleado_asignaciones (empresa_id, proyecto_id, estado);

CREATE INDEX IF NOT EXISTS ix_empleado_asig_periodo
  ON ncgconstructora.empleado_asignaciones (empresa_id, empleado_id, fecha_desde, fecha_hasta_estimada);
