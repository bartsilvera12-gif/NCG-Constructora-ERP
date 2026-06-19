-- Imágenes adjuntas a un presupuesto/venta. Se muestran al final del PDF
-- (una imagen por página). Bucket privado `presupuesto-imagenes`.

CREATE TABLE IF NOT EXISTS ncgconstructora.presupuesto_imagenes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  venta_id      uuid NOT NULL,
  storage_path  text NOT NULL,
  nombre        text NOT NULL,
  mime          text,
  size_bytes    integer,
  orden         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid
);

CREATE INDEX IF NOT EXISTS presupuesto_imagenes_venta_idx
  ON ncgconstructora.presupuesto_imagenes (empresa_id, venta_id, orden);

COMMENT ON TABLE ncgconstructora.presupuesto_imagenes IS
  'Imagenes adjuntas a un presupuesto/venta para mostrar al final del PDF.';
