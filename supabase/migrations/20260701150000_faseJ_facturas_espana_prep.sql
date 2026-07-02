-- =============================================================================
-- Sprint 3 · FASE J — Facturas España (modelo preparado, sin integración Hacienda)
--
-- Objetivo: dejar el modelo listo para que el módulo de facturación pueda
-- registrar facturas con desglose fiscal español (base imponible, IVA %,
-- IVA importe, CIF/NIF receptor, obra vinculada, archivo adjunto, estado
-- fiscal). Sin tocar la integración SIFEN (Paraguay) que sigue en `public`.
--
-- Las facturas viven en `public.facturas` (compartidas con el otro módulo).
-- Sólo agregamos columnas nullables + una tabla auxiliar de líneas si el
-- desglose lo requiere. Comienza siendo opt-in por factura: si estos campos
-- vienen null, la factura se comporta como hasta ahora.
--
-- No implementa envío/validación real ante Hacienda (AEAT). Ese paso requiere
-- certificados y firma electrónica, y se abordará en otro sprint.
-- =============================================================================

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS cif_nif_receptor       text,
  ADD COLUMN IF NOT EXISTS nombre_receptor        text,
  ADD COLUMN IF NOT EXISTS base_imponible         numeric,
  ADD COLUMN IF NOT EXISTS iva_pct                numeric,
  ADD COLUMN IF NOT EXISTS iva_importe            numeric,
  ADD COLUMN IF NOT EXISTS retencion_pct          numeric,
  ADD COLUMN IF NOT EXISTS retencion_importe      numeric,
  ADD COLUMN IF NOT EXISTS total_espana           numeric,
  ADD COLUMN IF NOT EXISTS proyecto_id_ncg        uuid,        -- obra asociada (opcional)
  ADD COLUMN IF NOT EXISTS archivo_storage_bucket text,
  ADD COLUMN IF NOT EXISTS archivo_storage_path   text,
  ADD COLUMN IF NOT EXISTS tipo_operacion         text,        -- nacional | intracomunitaria | exportacion
  ADD COLUMN IF NOT EXISTS estado_fiscal          text;        -- pendiente | informada | validada | rechazada

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facturas_tipo_operacion_chk') THEN
    ALTER TABLE public.facturas
      ADD CONSTRAINT facturas_tipo_operacion_chk
      CHECK (tipo_operacion IS NULL OR tipo_operacion IN ('nacional','intracomunitaria','exportacion'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facturas_estado_fiscal_chk') THEN
    ALTER TABLE public.facturas
      ADD CONSTRAINT facturas_estado_fiscal_chk
      CHECK (estado_fiscal IS NULL OR estado_fiscal IN ('pendiente','informada','validada','rechazada'));
  END IF;
END$$;

COMMENT ON COLUMN public.facturas.cif_nif_receptor IS
  'CIF / NIF del receptor (España). NULL para facturas del flujo Paraguay/SIFEN.';
COMMENT ON COLUMN public.facturas.estado_fiscal IS
  'Estado ante Hacienda: pendiente / informada / validada / rechazada. NULL = no aplica.';
COMMENT ON COLUMN public.facturas.proyecto_id_ncg IS
  'Obra asociada del schema ncgconstructora. FK lax (sin constraint dura porque cruza schemas).';
