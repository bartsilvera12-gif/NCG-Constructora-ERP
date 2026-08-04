-- Resetea el catálogo de tipos de servicio de cliente a solo 2 opciones:
-- "Construcción" y "Transporte y mantenimiento". Los tipos viejos
-- (cubierta_metalica, estructura_ligera, reforma, mantenimiento, otro, web,
-- saas, branding, etc.) se DESACTIVAN — no se borran para no perder la
-- trazabilidad de clientes históricos con esos slugs. Si se quieren eliminar
-- del todo, borrarlos manualmente desde /configuracion/crm.

-- Inserta los 2 nuevos (idempotente).
INSERT INTO ncgconstructora.cliente_tipos_servicio_catalogo (empresa_id, slug, nombre, activo, es_sistema, orden)
SELECT DISTINCT empresa_id, 'construccion', 'Construcción', true, true, 10
FROM ncgconstructora.cliente_tipos_servicio_catalogo
ON CONFLICT (empresa_id, slug) DO UPDATE
  SET nombre = EXCLUDED.nombre, activo = true, es_sistema = true, orden = EXCLUDED.orden;

INSERT INTO ncgconstructora.cliente_tipos_servicio_catalogo (empresa_id, slug, nombre, activo, es_sistema, orden)
SELECT DISTINCT empresa_id, 'transporte-mantenimiento', 'Transporte y mantenimiento', true, true, 20
FROM ncgconstructora.cliente_tipos_servicio_catalogo
ON CONFLICT (empresa_id, slug) DO UPDATE
  SET nombre = EXCLUDED.nombre, activo = true, es_sistema = true, orden = EXCLUDED.orden;

-- Desactiva todo lo demás (mantiene la fila para no romper FKs desde clientes).
UPDATE ncgconstructora.cliente_tipos_servicio_catalogo
SET activo = false, es_sistema = false
WHERE slug NOT IN ('construccion', 'transporte-mantenimiento');
