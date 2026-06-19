-- Ficha técnica (PDF) por producto. Requerida para cumplir normativa ES.
-- El bucket privado `productos-fichas-tecnicas` se autocrea desde el endpoint.

ALTER TABLE ncgconstructora.productos
  ADD COLUMN IF NOT EXISTS ficha_tecnica_path   text,
  ADD COLUMN IF NOT EXISTS ficha_tecnica_nombre text;
