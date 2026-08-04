-- Campos adicionales para el form de cliente al estilo Gestupla (España):
-- CP, país, persona de contacto, fecha alta/baja, régimen fiscal, forma de
-- pago y datos bancarios (IBAN + BIC/SWIFT). Todos nullables para no romper
-- filas históricas.

ALTER TABLE ncgconstructora.clientes
  ADD COLUMN IF NOT EXISTS codigo_postal    text,
  ADD COLUMN IF NOT EXISTS pais             text DEFAULT 'España',
  ADD COLUMN IF NOT EXISTS contacto_persona text,
  ADD COLUMN IF NOT EXISTS fecha_alta       date,
  ADD COLUMN IF NOT EXISTS fecha_baja       date,
  ADD COLUMN IF NOT EXISTS regimen_fiscal   text,
  ADD COLUMN IF NOT EXISTS forma_pago       text,
  ADD COLUMN IF NOT EXISTS iban             text,
  ADD COLUMN IF NOT EXISTS bic_swift        text;

COMMENT ON COLUMN ncgconstructora.clientes.codigo_postal   IS 'Código postal de la dirección fiscal.';
COMMENT ON COLUMN ncgconstructora.clientes.pais            IS 'País (default España).';
COMMENT ON COLUMN ncgconstructora.clientes.contacto_persona IS 'Persona de contacto (diferente al nombre_contacto si aplica).';
COMMENT ON COLUMN ncgconstructora.clientes.fecha_alta      IS 'Fecha de alta como cliente (independiente de created_at).';
COMMENT ON COLUMN ncgconstructora.clientes.fecha_baja      IS 'Fecha de baja; NULL si sigue activo.';
COMMENT ON COLUMN ncgconstructora.clientes.regimen_fiscal  IS 'Régimen fiscal ES: general, recargo_equivalencia, exento, otro.';
COMMENT ON COLUMN ncgconstructora.clientes.forma_pago      IS 'Forma de pago por defecto: transferencia, efectivo, tarjeta, giro, cheque, otro.';
COMMENT ON COLUMN ncgconstructora.clientes.iban            IS 'IBAN bancario del cliente para remesas o giros.';
COMMENT ON COLUMN ncgconstructora.clientes.bic_swift       IS 'Código BIC / SWIFT del banco.';
