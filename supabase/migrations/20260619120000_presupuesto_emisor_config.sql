-- Datos del emisor que se imprimen en el encabezado izquierdo del PDF de
-- presupuesto. Una fila por empresa. Editable desde /configuracion/presupuesto-emisor.

CREATE TABLE IF NOT EXISTS ncgconstructora.presupuesto_emisor_config (
  empresa_id   uuid PRIMARY KEY,
  nombre       text,
  direccion    text,
  cp_ciudad    text,
  provincia    text,
  nif          text,
  telefono     text,
  email        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

COMMENT ON TABLE ncgconstructora.presupuesto_emisor_config IS
  'Datos del emisor para el encabezado del PDF de presupuesto (1 fila por empresa).';
