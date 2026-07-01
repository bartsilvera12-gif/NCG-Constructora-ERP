-- =============================================================================
-- Sprint 1 · FASE G — Roles granulares (fundacional, mínimo intrusivo)
--
-- En esta instancia dedicada la tabla de usuarios vive en el schema
-- `ncgconstructora` (no en `public`). NO tocamos `ncgconstructora.usuarios.rol`
-- ni sus valores actuales ('super_admin','admin','usuario'); todas las RLS y
-- funciones existentes que la usan siguen operando sin cambios.
--
-- Se agrega en paralelo la columna `rol_rrhh` con enum textual controlado por
-- CHECK. Convive con `rol`: si `rol_rrhh` es NULL, el sistema cae al rol viejo
-- (backward compat). La capa API resuelve permisos mediante el helper
-- `ncgconstructora.rrhh_puede(accion)` (SECURITY DEFINER).
--
-- Backfill:
--   * usuarios con rol='super_admin' o 'admin'  -> rol_rrhh='admin'
--   * usuarios con rol='usuario'                -> rol_rrhh NULL (fallback en
--                                                  la función replica el
--                                                  comportamiento actual)
-- =============================================================================

-- Columna paralela sin NOT NULL para no romper INSERTs viejos
ALTER TABLE ncgconstructora.usuarios
  ADD COLUMN IF NOT EXISTS rol_rrhh text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_rrhh_chk'
  ) THEN
    ALTER TABLE ncgconstructora.usuarios
      ADD CONSTRAINT usuarios_rol_rrhh_chk
      CHECK (rol_rrhh IS NULL OR rol_rrhh IN (
        'admin','gestor','rrhh','encargado_obra','empleado'
      ));
  END IF;
END$$;

COMMENT ON COLUMN ncgconstructora.usuarios.rol_rrhh IS
  'Rol funcional para el módulo RRHH. Convive con `rol` (super_admin/admin/usuario); NULL = fallback al rol legacy.';

-- Backfill (idempotente: sólo actualiza si rol_rrhh es NULL)
UPDATE ncgconstructora.usuarios
   SET rol_rrhh = 'admin'
 WHERE rol_rrhh IS NULL
   AND rol IN ('super_admin','admin');

-- ---- Helper de permisos ----------------------------------------------------
-- rrhh_puede(accion text) devuelve true/false. Se usa desde la capa API y
-- desde RLS futuras. SECURITY DEFINER para operar sin permisos SELECT sobre
-- ncgconstructora.usuarios.
--
-- Matriz inicial (editable sin migración cambiando esta función):
--
--   Acción                       admin  gestor  rrhh  encargado  empleado  legacy(super_admin/admin/usuario)
--   empleados.ver                  x      x      x      x*         propio    x
--   empleados.editar               x      -      x      -          -         x
--   salarios.ver                   x      x      -      -          propio    x(*sólo super_admin/admin viejos)
--   salarios.editar                x      x      -      -          -         x(*sólo super_admin/admin viejos)
--   cursos.gestionar               x      -      x      -          -         x
--   vacaciones.gestionar           x      -      x      -          -         x
--   marcaciones.gestionar          x      -      x      x          -         x
--   compras.solicitar              x      x      -      x          -         x
--
--   x* encargado ve sólo empleados de su obra (join en la capa API).
--
-- El "legacy" habilita todo para super_admin/admin viejos y nada específico
-- para 'usuario' salvo lectura general de empleados/vacaciones (comportamiento
-- actual).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ncgconstructora.rrhh_puede(accion text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ncgconstructora, public
AS $$
DECLARE
  v_email    text;
  v_rol      text;
  v_rol_rrhh text;
BEGIN
  v_email := (auth.jwt() ->> 'email');
  IF v_email IS NULL THEN
    RETURN false;
  END IF;

  SELECT rol, rol_rrhh
    INTO v_rol, v_rol_rrhh
    FROM ncgconstructora.usuarios
   WHERE lower(email) = lower(v_email)
   LIMIT 1;

  IF v_rol IS NULL THEN
    RETURN false;
  END IF;

  -- Legacy super_admin/admin -> todo permitido
  IF v_rol IN ('super_admin','admin') THEN
    RETURN true;
  END IF;

  -- Fallback si no hay rol_rrhh definido -> comportamiento actual (rol='usuario'):
  -- permite operaciones no sensibles, bloquea salarios.
  IF v_rol_rrhh IS NULL THEN
    RETURN accion IN (
      'empleados.ver',
      'vacaciones.gestionar',
      'marcaciones.gestionar',
      'cursos.gestionar',
      'empleados.editar'
    );
  END IF;

  -- Matriz por rol_rrhh
  RETURN CASE v_rol_rrhh
    WHEN 'admin' THEN true
    WHEN 'gestor' THEN accion IN (
      'empleados.ver','salarios.ver','salarios.editar','compras.solicitar'
    )
    WHEN 'rrhh' THEN accion IN (
      'empleados.ver','empleados.editar',
      'cursos.gestionar','vacaciones.gestionar','marcaciones.gestionar'
    )
    WHEN 'encargado_obra' THEN accion IN (
      'empleados.ver','marcaciones.gestionar','compras.solicitar'
    )
    WHEN 'empleado' THEN accion IN (
      'empleados.ver.propio','vacaciones.solicitar.propio'
    )
    ELSE false
  END;
END;
$$;

REVOKE ALL ON FUNCTION ncgconstructora.rrhh_puede(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ncgconstructora.rrhh_puede(text) TO authenticated;

COMMENT ON FUNCTION ncgconstructora.rrhh_puede(text) IS
  'Devuelve true si el usuario JWT actual tiene el permiso para la acción indicada. Sistema aditivo: rol legacy sigue funcionando; rol_rrhh refina.';
