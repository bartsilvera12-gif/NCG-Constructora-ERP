-- Archivos / documentación adjunta por empleado (DNI, contratos, certificados,
-- cursos, etc.). Bucket privado `empleado-archivos`; los bytes viven en
-- storage y esta tabla guarda los metadatos.

CREATE TABLE IF NOT EXISTS ncgconstructora.empleado_archivos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  empleado_id     uuid NOT NULL REFERENCES ncgconstructora.empleados(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  storage_bucket  text NOT NULL DEFAULT 'empleado-archivos',
  storage_path    text NOT NULL,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_empleado_archivos_nombre_non_empty CHECK (length(trim(nombre)) > 0)
);

CREATE INDEX IF NOT EXISTS empleado_archivos_empleado_idx
  ON ncgconstructora.empleado_archivos (empresa_id, empleado_id, created_at DESC);

COMMENT ON TABLE ncgconstructora.empleado_archivos IS
  'Archivos adjuntos a un empleado: documentación, cursos, certificados.';
