-- Feriados y ausencias para el reporte de marcaciones.
-- Los feriados se marcan en el PDF y permiten identificar horas extra por
-- trabajo en día no laborable. Las ausencias por empleado (reposo, vacaciones,
-- permiso, baja) se muestran en el reporte como filas coloreadas.

CREATE TABLE IF NOT EXISTS ncgconstructora.feriados (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  fecha       date NOT NULL,
  nombre      text NOT NULL,
  ambito      text NOT NULL DEFAULT 'nacional' CHECK (ambito IN ('nacional', 'regional', 'local')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  UNIQUE (empresa_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_feriados_empresa_fecha
  ON ncgconstructora.feriados (empresa_id, fecha);

COMMENT ON TABLE ncgconstructora.feriados IS
  'Días feriados por empresa. Se muestran en el reporte de marcaciones y permiten identificar horas trabajadas en feriado.';

CREATE TABLE IF NOT EXISTS ncgconstructora.empleado_ausencias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  empleado_id  uuid NOT NULL,
  fecha_desde  date NOT NULL,
  fecha_hasta  date NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('reposo', 'vacaciones', 'permiso', 'baja', 'otro')),
  observacion  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  CHECK (fecha_hasta >= fecha_desde)
);

CREATE INDEX IF NOT EXISTS idx_ausencias_empresa_emp
  ON ncgconstructora.empleado_ausencias (empresa_id, empleado_id);

CREATE INDEX IF NOT EXISTS idx_ausencias_rango
  ON ncgconstructora.empleado_ausencias (empresa_id, fecha_desde, fecha_hasta);

COMMENT ON TABLE ncgconstructora.empleado_ausencias IS
  'Ausencias por empleado (reposo, vacaciones, permiso, baja). Se marcan en el reporte con color/tag.';
