-- =============================================================================
-- Recibos de nómina por empleado (estilo recibo español: devengos, deducciones,
-- bases de cotización, IRPF, aportaciones empresa). Cada mes/empleado puede
-- tener uno o más recibos (ordinario, paga extra, atrasos...).
--
-- Schema: ncgconstructora (instancia dedicada).
-- Aditiva e idempotente.
-- =============================================================================

-- ---- Campos extra en empresas (datos del recibo) ----------------------------
ALTER TABLE ncgconstructora.empresas
  ADD COLUMN IF NOT EXISTS nif                       text,
  ADD COLUMN IF NOT EXISTS inscripcion_ss            text,
  ADD COLUMN IF NOT EXISTS cnae                      text,
  ADD COLUMN IF NOT EXISTS centro_trabajo_direccion  text;

-- ---- Campos extra en empleados (datos del recibo) ---------------------------
ALTER TABLE ncgconstructora.empleados
  ADD COLUMN IF NOT EXISTS afiliacion_ss     text,
  ADD COLUMN IF NOT EXISTS grupo_cotizacion  text,
  ADD COLUMN IF NOT EXISTS categoria_nivel   text;

-- ---- Recibo (cabecera) ------------------------------------------------------
CREATE TABLE IF NOT EXISTS ncgconstructora.nomina_recibos (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  uuid NOT NULL,
  empleado_id                 uuid NOT NULL REFERENCES ncgconstructora.empleados(id) ON DELETE CASCADE,

  periodo_desde               date NOT NULL,
  periodo_hasta               date NOT NULL,
  total_dias                  integer NOT NULL DEFAULT 30,
  dias_cotizados              integer NOT NULL DEFAULT 30,

  -- Snapshots para que el PDF no cambie si después editan empresa/empleado
  empresa_nombre_snapshot     text,
  empresa_nif_snapshot        text,
  empresa_inscripcion_ss_snapshot text,
  empresa_cnae_snapshot       text,
  empresa_centro_snapshot     text,

  empleado_nombre_snapshot    text,
  empleado_nif_snapshot       text,
  empleado_afiliacion_snapshot text,
  empleado_categoria_snapshot text,
  empleado_grupo_cot_snapshot text,
  empleado_puesto_snapshot    text,
  empleado_antiguedad_snapshot date,

  -- Totales (autocalculados desde devengos/deducciones; persistidos para reportes)
  total_devengado             numeric NOT NULL DEFAULT 0,
  total_deducciones           numeric NOT NULL DEFAULT 0,
  liquido                     numeric NOT NULL DEFAULT 0,
  coste_empresa               numeric NOT NULL DEFAULT 0,

  estado                      text NOT NULL DEFAULT 'borrador',  -- borrador | emitido | anulado
  observaciones               text,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nomina_recibos_estado_chk
    CHECK (estado IN ('borrador', 'emitido', 'anulado')),
  CONSTRAINT nomina_recibos_periodo_chk
    CHECK (periodo_hasta >= periodo_desde)
);

CREATE INDEX IF NOT EXISTS nomina_recibos_empleado_idx
  ON ncgconstructora.nomina_recibos (empresa_id, empleado_id, periodo_desde DESC);

CREATE INDEX IF NOT EXISTS nomina_recibos_periodo_idx
  ON ncgconstructora.nomina_recibos (empresa_id, periodo_desde DESC);

COMMENT ON TABLE ncgconstructora.nomina_recibos IS
  'Recibo mensual de nómina por empleado. Snapshots de empresa/empleado para mantener el PDF estable.';

-- ---- Líneas de devengos -----------------------------------------------------
CREATE TABLE IF NOT EXISTS ncgconstructora.nomina_recibo_devengos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recibo_id         uuid NOT NULL REFERENCES ncgconstructora.nomina_recibos(id) ON DELETE CASCADE,
  empresa_id        uuid NOT NULL,
  concepto          text NOT NULL,
  cantidad          numeric,
  importe_unitario  numeric,
  importe_total     numeric NOT NULL DEFAULT 0,
  es_salarial       boolean NOT NULL DEFAULT true,
  orden             integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nomina_recibo_devengos_recibo_idx
  ON ncgconstructora.nomina_recibo_devengos (recibo_id, orden);

COMMENT ON TABLE ncgconstructora.nomina_recibo_devengos IS
  'Líneas de devengo del recibo (Salario base, Plus actividad, etc).';

-- ---- Líneas de deducciones / aportaciones -----------------------------------
CREATE TABLE IF NOT EXISTS ncgconstructora.nomina_recibo_deducciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recibo_id       uuid NOT NULL REFERENCES ncgconstructora.nomina_recibos(id) ON DELETE CASCADE,
  empresa_id      uuid NOT NULL,
  tipo            text NOT NULL,  -- aportacion_trabajador | irpf | especie | aportacion_empresa
  concepto        text NOT NULL,
  base            numeric,
  tipo_pct        numeric,
  importe         numeric NOT NULL DEFAULT 0,
  orden           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nomina_recibo_deducciones_tipo_chk
    CHECK (tipo IN ('aportacion_trabajador', 'irpf', 'especie', 'aportacion_empresa'))
);

CREATE INDEX IF NOT EXISTS nomina_recibo_deducciones_recibo_idx
  ON ncgconstructora.nomina_recibo_deducciones (recibo_id, tipo, orden);

COMMENT ON TABLE ncgconstructora.nomina_recibo_deducciones IS
  'Líneas de deducción del recibo: aportaciones del trabajador, IRPF, especie, y aportaciones empresa.';
