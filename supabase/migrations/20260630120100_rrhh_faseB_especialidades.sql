-- =============================================================================
-- Sprint 1 · FASE B — Especialidades / puestos de trabajo
--
-- Catálogo formal `especialidades` + relación N:N `empleado_especialidades`.
-- Convive con `empleados.tipos_empleado` (text[]) como legacy — no se toca.
-- El nuevo catálogo manda a partir de ahora en la UI y en reportes.
--
-- Semilla: "Especialista en tejado" como principal, más el resto sugeridos.
-- Idempotente por (empresa_id, slug).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ncgconstructora.especialidades (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  nombre       text NOT NULL,
  slug         text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  orden        integer NOT NULL DEFAULT 0,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT especialidades_slug_chk CHECK (length(trim(slug)) > 0),
  CONSTRAINT especialidades_nombre_chk CHECK (length(trim(nombre)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS especialidades_empresa_slug_uq
  ON ncgconstructora.especialidades (empresa_id, slug);

COMMENT ON TABLE ncgconstructora.especialidades IS
  'Catálogo de especialidades / puestos de trabajo (multiempresa). Reemplaza en UI al array legacy `empleados.tipos_empleado`, que se conserva.';

-- Relación N:N -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ncgconstructora.empleado_especialidades (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL,
  empleado_id       uuid NOT NULL REFERENCES ncgconstructora.empleados(id) ON DELETE CASCADE,
  especialidad_id   uuid NOT NULL REFERENCES ncgconstructora.especialidades(id) ON DELETE RESTRICT,
  es_principal      boolean NOT NULL DEFAULT false,
  nivel             text,                                   -- aprendiz | intermedio | especialista | encargado
  observaciones     text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empleado_especialidades_nivel_chk
    CHECK (nivel IS NULL OR nivel IN ('aprendiz','intermedio','especialista','encargado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS empleado_especialidades_uq
  ON ncgconstructora.empleado_especialidades (empresa_id, empleado_id, especialidad_id);

-- Solo una especialidad principal por empleado
CREATE UNIQUE INDEX IF NOT EXISTS empleado_especialidades_principal_uq
  ON ncgconstructora.empleado_especialidades (empresa_id, empleado_id)
  WHERE es_principal = true;

CREATE INDEX IF NOT EXISTS empleado_especialidades_empleado_idx
  ON ncgconstructora.empleado_especialidades (empresa_id, empleado_id);

COMMENT ON TABLE ncgconstructora.empleado_especialidades IS
  'Especialidades asignadas a un empleado. Una única especialidad principal por empleado (índice parcial).';

-- Semilla del catálogo ---------------------------------------------------------
-- Se ejecuta por cada empresa existente en el schema. Idempotente por slug.
DO $$
DECLARE
  emp RECORD;
BEGIN
  FOR emp IN SELECT id FROM ncgconstructora.empresas LOOP
    INSERT INTO ncgconstructora.especialidades (empresa_id, nombre, slug, orden)
    VALUES
      (emp.id, 'Especialista en tejado',   'especialista-en-tejado',   10),
      (emp.id, 'Fontanero',                'fontanero',                20),
      (emp.id, 'Electricista',             'electricista',             30),
      (emp.id, 'Albañil',                  'albanil',                  40),
      (emp.id, 'Pintor',                   'pintor',                   50),
      (emp.id, 'Peón',                     'peon',                     60),
      (emp.id, 'Encargado de obra',        'encargado-de-obra',        70),
      (emp.id, 'Gruista',                  'gruista',                  80),
      (emp.id, 'Soldador',                 'soldador',                 90),
      (emp.id, 'Técnico de seguridad',     'tecnico-de-seguridad',    100),
      (emp.id, 'Otro',                     'otro',                    999)
    ON CONFLICT (empresa_id, slug) DO NOTHING;
  END LOOP;
END$$;
