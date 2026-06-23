-- "Kiosco" público de fichaje: los empleados marcan entrada/salida desde un
-- link que NO requiere login. La URL incluye un token aleatorio por empresa
-- (revocable) y el empleado se identifica tipeando su DNI.

CREATE TABLE IF NOT EXISTS ncgconstructora.fichar_tokens (
  token        text PRIMARY KEY,
  empresa_id   uuid NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid
);

CREATE INDEX IF NOT EXISTS fichar_tokens_empresa_idx
  ON ncgconstructora.fichar_tokens (empresa_id, activo);

COMMENT ON TABLE ncgconstructora.fichar_tokens IS
  'Tokens publicos para el kiosco de fichaje de empleados.';

-- GPS y metadata del marcado por kiosco. Guardamos el momento absoluto
-- (timestamp completo) además de la hora HH:MM existente para auditoría.
ALTER TABLE ncgconstructora.empleado_fichajes
  ADD COLUMN IF NOT EXISTS entrada_lat        numeric,
  ADD COLUMN IF NOT EXISTS entrada_lng        numeric,
  ADD COLUMN IF NOT EXISTS entrada_marcado_at timestamptz,
  ADD COLUMN IF NOT EXISTS salida_lat         numeric,
  ADD COLUMN IF NOT EXISTS salida_lng         numeric,
  ADD COLUMN IF NOT EXISTS salida_marcado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS marcado_kiosco     boolean NOT NULL DEFAULT false;
