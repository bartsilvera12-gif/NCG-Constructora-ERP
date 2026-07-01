-- =============================================================================
-- Sprint 1 · FASE C — Historial salarial
--
-- Tabla `empleado_salarios` con registros de vigencia por empleado. NO calcula
-- impuestos ni nómina legal: sólo persiste los valores que carga el gestor
-- (bruto, neto, pluses jsonb, deducciones jsonb, coste_empresa).
--
-- La columna `empleados.salario_base` se conserva como "vigente denormalizado"
-- y no se modifica en este migration. Puede sincronizarse en el futuro con un
-- trigger, pero por ahora es la aplicación la responsable de actualizarla
-- cuando cambia el salario vigente.
--
-- Vista `empleado_salario_vigente_v` devuelve para cada empleado el registro
-- vigente hoy (o el más reciente si no hay ninguno cubriendo la fecha).
--
-- Sin cambios de RLS. La protección por rol vive en la capa API (Fase G).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ncgconstructora.empleado_salarios (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid NOT NULL,
  empleado_id              uuid NOT NULL REFERENCES ncgconstructora.empleados(id) ON DELETE CASCADE,

  fecha_vigencia_desde     date NOT NULL,
  fecha_vigencia_hasta     date,                              -- NULL = vigente indefinido

  salario_bruto            numeric NOT NULL DEFAULT 0,
  salario_neto             numeric,                           -- opcional, si el gestor lo carga
  plus_peligrosidad        numeric NOT NULL DEFAULT 0,
  plus_prl                 numeric NOT NULL DEFAULT 0,        -- prevención de riesgos laborales
  otros_pluses             jsonb NOT NULL DEFAULT '{}'::jsonb,-- ej: {"antiguedad": 30, "nocturno": 45}
  deducciones              jsonb NOT NULL DEFAULT '{}'::jsonb,-- ej: {"irpf_pct": 9.76, "ss_pct": 4.7}
  coste_empresa            numeric,                           -- calculado por el gestor (bruto + aportaciones)

  moneda                   text NOT NULL DEFAULT 'EUR',
  observaciones            text,

  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT empleado_salarios_periodo_chk
    CHECK (fecha_vigencia_hasta IS NULL OR fecha_vigencia_hasta >= fecha_vigencia_desde),
  CONSTRAINT empleado_salarios_bruto_chk
    CHECK (salario_bruto >= 0)
);

CREATE INDEX IF NOT EXISTS empleado_salarios_empleado_idx
  ON ncgconstructora.empleado_salarios (empresa_id, empleado_id, fecha_vigencia_desde DESC);

CREATE INDEX IF NOT EXISTS empleado_salarios_vigencia_idx
  ON ncgconstructora.empleado_salarios (empresa_id, empleado_id)
  WHERE fecha_vigencia_hasta IS NULL;

COMMENT ON TABLE ncgconstructora.empleado_salarios IS
  'Historial salarial por empleado con periodo de vigencia. Bruto/neto/pluses/deducciones cargados manualmente por gestor.';

-- Vista de salario vigente hoy. Si ningún tramo cubre CURRENT_DATE devuelve el
-- último registro por fecha_vigencia_desde (comportamiento tolerante).
CREATE OR REPLACE VIEW ncgconstructora.empleado_salario_vigente_v AS
SELECT DISTINCT ON (s.empresa_id, s.empleado_id)
  s.empresa_id,
  s.empleado_id,
  s.id                        AS salario_id,
  s.fecha_vigencia_desde,
  s.fecha_vigencia_hasta,
  s.salario_bruto,
  s.salario_neto,
  s.plus_peligrosidad,
  s.plus_prl,
  s.otros_pluses,
  s.deducciones,
  s.coste_empresa,
  s.moneda,
  s.observaciones,
  (s.fecha_vigencia_desde <= CURRENT_DATE
     AND (s.fecha_vigencia_hasta IS NULL OR s.fecha_vigencia_hasta >= CURRENT_DATE)
  ) AS vigente_hoy
FROM ncgconstructora.empleado_salarios s
ORDER BY
  s.empresa_id,
  s.empleado_id,
  -- prioriza tramos que cubren hoy; si ninguno, el más reciente por desde
  (CASE
    WHEN s.fecha_vigencia_desde <= CURRENT_DATE
      AND (s.fecha_vigencia_hasta IS NULL OR s.fecha_vigencia_hasta >= CURRENT_DATE)
    THEN 0 ELSE 1
   END),
  s.fecha_vigencia_desde DESC;

COMMENT ON VIEW ncgconstructora.empleado_salario_vigente_v IS
  'Un registro por empleado con su salario vigente hoy (fallback: el tramo más reciente si ninguno cubre la fecha actual).';
