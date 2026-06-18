-- =============================================================================
-- Gastos: moneda, banco e IVA deducible.
--
-- Aditiva e idempotente. NCG opera en EUR pero dejamos abierto a USD/GS por
-- compat con casos puntuales. iva_deducible permite marcar el gasto como
-- deducible y separar la base imponible del IVA. Si no se carga iva_tipo, el
-- monto_iva queda en 0 (= no deducible).
-- =============================================================================

ALTER TABLE ncgconstructora.gastos
  ADD COLUMN IF NOT EXISTS moneda         text    NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS banco          text,
  ADD COLUMN IF NOT EXISTS iva_deducible  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iva_tipo       text,
  ADD COLUMN IF NOT EXISTS monto_iva      numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_moneda_check') THEN
    ALTER TABLE ncgconstructora.gastos
      ADD CONSTRAINT gastos_moneda_check
      CHECK (moneda IN ('EUR','USD','GS'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_iva_tipo_check') THEN
    ALTER TABLE ncgconstructora.gastos
      ADD CONSTRAINT gastos_iva_tipo_check
      CHECK (iva_tipo IS NULL OR iva_tipo IN ('21','10','4','exenta'));
  END IF;
END $$;
