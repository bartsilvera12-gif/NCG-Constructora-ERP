-- =============================================================================
-- Alta de empleado: PRADO AREVALO, LUIS FERNANDO
-- Fuente: nómina mayo 2026 (GONZALEZ SOSA, NORMA CECILIA - NIF 61264624F)
-- Schema: ncgconstructora
--
-- Datos del PDF que NO tienen columna en empleados y se omiten:
--   N.I.F. del trabajador (X4869572N)  -> guardado como `documento` con tipo NIF
--   Afiliación S.S.: 281137737891
--   Categoría: NIVEL IX (Diario)
--   Grupo cotización: 08
--   C.N.A.E.: 4399
--   Centro de trabajo: CL VERSALLES, 1 1 A. ARANJUEZ
--   Empresa del recibo (GONZALEZ SOSA, NORMA CECILIA, NIF 61264624F,
--                       Inscripción S.S. 28251879688)
-- Si más adelante quieren persistirlos, hay que extender el schema.
-- =============================================================================

INSERT INTO ncgconstructora.empleados (
  empresa_id,
  nombre,
  tipo_documento,
  documento,
  nacionalidad,
  cargo,
  fecha_ingreso,
  tipo_periodo,
  salario_base,
  costo_hora,
  activo
)
VALUES (
  -- empresa_id: reemplazar por el uuid real de la empresa NCG si hay varias.
  -- Si sólo hay una empresa en este tenant, el siguiente subselect la resuelve solo:
  (SELECT id FROM ncgconstructora.empresas LIMIT 1),
  'PRADO AREVALO, LUIS FERNANDO',
  'NIF',
  'X4869572N',
  'Extranjero',
  'PEÓN ESPECIALIZADO',
  DATE '2021-08-23',
  'diario',          -- la categoría del PDF es "NIVEL IX (Diario)"
  1647.71,           -- total devengado mensual (Salario base + a cuenta convenio + plus actividad + plus extrasalarial)
  4.05,              -- jornal 32,39 €/día / 8 h ≈ 4,05 €/h (referencial, ajustar si manejan otra base horaria)
  true
);
