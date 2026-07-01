/**
 * Permisos RRHH — gate para endpoints y UI.
 *
 * Evalúa la misma matriz que la función SQL `ncgconstructora.rrhh_puede`, pero
 * en TypeScript para poder usarla con el cliente service-role de las rutas API
 * (los endpoints ya resolvieron el usuario con `getTenantSupabaseFromAuth`).
 *
 * Fuente de verdad: `ncgconstructora.usuarios.rol` (legacy) + `rol_rrhh`
 * (Fase G). La función SQL sigue existiendo para uso desde RLS futuras.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export type RrhhAccion =
  | "empleados.ver"
  | "empleados.editar"
  | "empleados.ver.propio"
  | "salarios.ver"
  | "salarios.editar"
  | "cursos.gestionar"
  | "vacaciones.gestionar"
  | "vacaciones.solicitar.propio"
  | "marcaciones.gestionar"
  | "compras.solicitar";

export type RolRrhh = "admin" | "gestor" | "rrhh" | "encargado_obra" | "empleado";
export type RolLegacy = "super_admin" | "admin" | "usuario" | string;

export type UsuarioPermisos = {
  rol: RolLegacy | null;
  rol_rrhh: RolRrhh | null;
};

const MATRIZ_RRHH: Record<RolRrhh, RrhhAccion[]> = {
  admin: [
    "empleados.ver","empleados.editar","empleados.ver.propio",
    "salarios.ver","salarios.editar",
    "cursos.gestionar","vacaciones.gestionar","vacaciones.solicitar.propio",
    "marcaciones.gestionar","compras.solicitar",
  ],
  gestor: [
    "empleados.ver","salarios.ver","salarios.editar","compras.solicitar",
  ],
  rrhh: [
    "empleados.ver","empleados.editar",
    "cursos.gestionar","vacaciones.gestionar","marcaciones.gestionar",
  ],
  encargado_obra: [
    "empleados.ver","marcaciones.gestionar","compras.solicitar",
  ],
  empleado: [
    "empleados.ver.propio","vacaciones.solicitar.propio",
  ],
};

// Comportamiento cuando rol_rrhh es NULL y el rol legacy es 'usuario'.
// Preserva la lectura general que ya existía, bloquea salarios.
const FALLBACK_ROL_USUARIO: RrhhAccion[] = [
  "empleados.ver","empleados.editar",
  "cursos.gestionar","vacaciones.gestionar","marcaciones.gestionar",
];

export function puede(u: UsuarioPermisos, accion: RrhhAccion): boolean {
  if (!u.rol) return false;
  // Legacy total: super_admin/admin viejos habilitan todo
  if (u.rol === "super_admin" || u.rol === "admin") return true;
  if (u.rol_rrhh) {
    return (MATRIZ_RRHH[u.rol_rrhh] ?? []).includes(accion);
  }
  return FALLBACK_ROL_USUARIO.includes(accion);
}

/** Lee los roles del usuario autenticado (ncgconstructora.usuarios). */
export async function leerPermisosDeUsuario(
  supabase: AppSupabaseClient,
  usuarioCatalogId: string | null,
  email: string | null,
): Promise<UsuarioPermisos> {
  const q = supabase.from("usuarios").select("rol, rol_rrhh").limit(1);
  const { data, error } = usuarioCatalogId
    ? await q.eq("id", usuarioCatalogId).maybeSingle()
    : await (email ? q.ilike("email", email).maybeSingle() : q.maybeSingle());
  if (error || !data) return { rol: null, rol_rrhh: null };
  const row = data as { rol: string | null; rol_rrhh: string | null };
  return {
    rol: (row.rol as RolLegacy) ?? null,
    rol_rrhh: (row.rol_rrhh as RolRrhh) ?? null,
  };
}
