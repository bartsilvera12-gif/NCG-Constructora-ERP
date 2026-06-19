-- El form de partida manual permite tipos adicionales (alquiler_equipo,
-- retiro_escombros, seguridad_andamio, limpieza_final) que la CHECK
-- original rechazaba. Reemplazamos la constraint por una con la lista
-- completa.

ALTER TABLE ncgconstructora.ventas_items
  DROP CONSTRAINT IF EXISTS ventas_items_tipo_partida_check;

ALTER TABLE ncgconstructora.ventas_items
  ADD CONSTRAINT ventas_items_tipo_partida_check
  CHECK (tipo_partida IN (
    'producto',
    'mano_obra',
    'servicio',
    'transporte',
    'alquiler_equipo',
    'retiro_escombros',
    'seguridad_andamio',
    'limpieza_final',
    'otro'
  ));
