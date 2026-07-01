-- =============================================================================
-- Sprint 2 · FASE D — Cursos y certificados
--
-- Dos tablas:
--   * cursos_catalogo   : nombres estándar y tipo (curso|certificado|
--                         habilitacion|documento_legal), duración por defecto
--                         (para autocalcular fecha_vencimiento cuando la UI lo
--                         requiera).
--   * empleado_cursos   : registro por empleado; puede apuntar al catálogo o
--                         ser libre (nombre + tipo en la fila). Almacena
--                         archivo en Storage (mismo bucket 'empleado-archivos'
--                         con carpeta cursos/) y expone estado calculado.
--
-- Estado es una columna guardada pero también hay una función
-- `empleado_curso_estado_calc(fecha_venc)` que lo recalcula desde la fecha —
-- útil para reportes puntuales o para migraciones legacy sin re-cargar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ncgconstructora.cursos_catalogo (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL,
  nombre                    text NOT NULL,
  slug                      text NOT NULL,
  tipo                      text NOT NULL DEFAULT 'curso',
  entidad_emisora_default   text,
  duracion_dias             integer,
  activo                    boolean NOT NULL DEFAULT true,
  orden                     integer NOT NULL DEFAULT 0,
  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cursos_catalogo_tipo_chk
    CHECK (tipo IN ('curso','certificado','habilitacion','documento_legal')),
  CONSTRAINT cursos_catalogo_nombre_chk CHECK (length(trim(nombre)) > 0),
  CONSTRAINT cursos_catalogo_slug_chk   CHECK (length(trim(slug))   > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS cursos_catalogo_empresa_slug_uq
  ON ncgconstructora.cursos_catalogo (empresa_id, slug);

COMMENT ON TABLE ncgconstructora.cursos_catalogo IS
  'Catálogo de cursos, certificados, habilitaciones y documentos legales.';

-- Semilla base sugerida (idempotente por slug)
DO $$
DECLARE emp RECORD;
BEGIN
  FOR emp IN SELECT id FROM ncgconstructora.empresas LOOP
    INSERT INTO ncgconstructora.cursos_catalogo (empresa_id, nombre, slug, tipo, duracion_dias, orden)
    VALUES
      (emp.id, 'Prevención de Riesgos Laborales (PRL)', 'prl',                    'curso',         365, 10),
      (emp.id, 'Trabajo en altura',                     'trabajo-en-altura',       'certificado',   1095, 20),
      (emp.id, 'Manipulación de maquinaria',            'manipulacion-maquinaria', 'habilitacion',  1825, 30),
      (emp.id, 'Seguridad en obra',                     'seguridad-obra',          'curso',         365, 40),
      (emp.id, 'Electricidad',                          'electricidad',            'certificado',   1825, 50),
      (emp.id, 'Fontanería',                            'fontaneria',              'certificado',   1825, 60),
      (emp.id, 'Tejados',                               'tejados',                 'certificado',   1825, 70),
      (emp.id, 'Primeros auxilios',                     'primeros-auxilios',       'curso',         730, 80),
      (emp.id, 'Otro',                                  'otro',                    'documento_legal',NULL, 999)
    ON CONFLICT (empresa_id, slug) DO NOTHING;
  END LOOP;
END$$;

-- ---- empleado_cursos --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ncgconstructora.empleado_cursos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL,
  empleado_id           uuid NOT NULL REFERENCES ncgconstructora.empleados(id) ON DELETE CASCADE,
  curso_id              uuid REFERENCES ncgconstructora.cursos_catalogo(id) ON DELETE SET NULL,
  -- Snapshot para que un cambio en el catálogo no afecte historial:
  nombre                text NOT NULL,
  tipo                  text NOT NULL DEFAULT 'curso',
  entidad_emisora       text,
  fecha_emision         date,
  fecha_vencimiento     date,
  estado                text NOT NULL DEFAULT 'pendiente',
  -- Archivo adjunto (mismo bucket que empleado_archivos, carpeta cursos/)
  storage_bucket        text,
  storage_path          text,
  mime_type             text,
  size_bytes            bigint,
  observaciones         text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empleado_cursos_tipo_chk
    CHECK (tipo IN ('curso','certificado','habilitacion','documento_legal')),
  CONSTRAINT empleado_cursos_estado_chk
    CHECK (estado IN ('vigente','vencido','por_vencer','pendiente','en_revision')),
  CONSTRAINT empleado_cursos_fechas_chk
    CHECK (fecha_vencimiento IS NULL OR fecha_emision IS NULL OR fecha_vencimiento >= fecha_emision)
);

CREATE INDEX IF NOT EXISTS empleado_cursos_empleado_idx
  ON ncgconstructora.empleado_cursos (empresa_id, empleado_id, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS empleado_cursos_venc_idx
  ON ncgconstructora.empleado_cursos (empresa_id, fecha_vencimiento)
  WHERE fecha_vencimiento IS NOT NULL;

COMMENT ON TABLE ncgconstructora.empleado_cursos IS
  'Cursos/certificados/habilitaciones de un empleado. Snapshot de nombre y tipo del catálogo para preservar historial.';

-- Función utilitaria para recalcular estado desde fechas (para vistas/reportes)
CREATE OR REPLACE FUNCTION ncgconstructora.empleado_curso_estado_calc(fecha_venc date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN fecha_venc IS NULL                        THEN 'pendiente'
    WHEN fecha_venc <  CURRENT_DATE                THEN 'vencido'
    WHEN fecha_venc <= CURRENT_DATE + INTERVAL '30 day' THEN 'por_vencer'
    ELSE 'vigente'
  END;
$$;

COMMENT ON FUNCTION ncgconstructora.empleado_curso_estado_calc(date) IS
  'Devuelve el estado calculado (vigente/por_vencer/vencido/pendiente) para una fecha de vencimiento.';
