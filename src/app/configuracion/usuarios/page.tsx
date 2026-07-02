"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const dynamic = "force-dynamic";

type RolRrhh = "admin" | "gestor" | "rrhh" | "encargado_obra" | "empleado" | null;

type Usuario = {
  id: string;
  nombre: string | null;
  email: string | null;
  rol: string | null;         // legacy: super_admin | admin | usuario
  rol_rrhh: RolRrhh;
  estado: string | null;
};

const ROLES_INFO: Array<{ v: NonNullable<RolRrhh>; label: string; desc: string; badge: string }> = [
  { v: "admin",          label: "Admin",           desc: "Acceso total al módulo RRHH.",              badge: "bg-rose-50 text-rose-700 border-rose-200" },
  { v: "gestor",         label: "Gestor",          desc: "Salarios (ver/editar). Compras (solicitar).", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  { v: "rrhh",           label: "RRHH",            desc: "Empleados, cursos, vacaciones, marcaciones.", badge: "bg-sky-50 text-sky-700 border-sky-200" },
  { v: "encargado_obra", label: "Encargado obra",  desc: "Marcaciones y compras de su obra.",         badge: "bg-amber-50 text-amber-700 border-amber-200" },
  { v: "empleado",       label: "Empleado",        desc: "Solo su propia información (portal).",      badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

const LEGACY_BADGE: Record<string, string> = {
  super_admin: "bg-rose-100 text-rose-800",
  admin:       "bg-rose-50 text-rose-700",
  usuario:     "bg-slate-100 text-slate-600",
};

function labelRolRrhh(r: RolRrhh): string {
  if (!r) return "—";
  return ROLES_INFO.find((x) => x.v === r)?.label ?? r;
}

export default function UsuariosPermisosPage() {
  const [items, setItems] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = () => {
    setLoading(true);
    fetchWithSupabaseSession("/api/rrhh/admin/usuarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { usuarios: Usuario[] }; error?: string }) => {
        if (j?.success && j.data) { setItems(j.data.usuarios); setErr(null); }
        else setErr(j.error ?? "No se pudo cargar");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  };
  useEffect(cargar, []);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return items;
    return items.filter((u) =>
      (u.nombre ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  }, [items, filtro]);

  const cambiarRol = async (u: Usuario, nuevoRol: RolRrhh) => {
    setSaving((s) => ({ ...s, [u.id]: true }));
    setMsg(null);
    const r = await fetchWithSupabaseSession(`/api/rrhh/admin/usuarios/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol_rrhh: nuevoRol }),
    });
    setSaving((s) => ({ ...s, [u.id]: false }));
    if (r.ok) {
      setItems((list) => list.map((x) => x.id === u.id ? { ...x, rol_rrhh: nuevoRol } : x));
      setMsg(`Rol actualizado para ${u.nombre ?? u.email}.`);
      setTimeout(() => setMsg(null), 2500);
    } else {
      const j = await r.json().catch(() => ({}));
      setMsg(j.error ?? "No se pudo guardar");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuración"
        title="Usuarios y roles"
        description="Asigná el rol funcional de RRHH a cada usuario. El rol legacy (super_admin/admin/usuario) sigue funcionando; este es un refinamiento para gate de salarios, cursos, vacaciones, marcaciones y compras."
        backHref="/configuracion"
        backLabel="Configuración"
      />

      {/* Leyenda */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Matriz de roles</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {ROLES_INFO.map((r) => (
            <div key={r.v} className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
              <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${r.badge}`}>{r.label}</div>
              <p className="mt-2 text-xs text-slate-600">{r.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Los usuarios con rol legacy <code className="rounded bg-slate-100 px-1">super_admin</code> o <code className="rounded bg-slate-100 px-1">admin</code> tienen acceso total sin importar el rol RRHH.
          Dejá el rol RRHH en <em>—</em> para que el usuario funcione como antes (acceso genérico sin salarios).
        </p>
      </div>

      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>}
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</div>}

      <div className="flex items-center gap-2">
        <input placeholder="Buscar por nombre o email…" value={filtro} onChange={(e) => setFiltro(e.target.value)}
          className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        <span className="text-xs text-slate-500">{filtrados.length} de {items.length}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Usuario</th>
              <th className="px-4 py-3 font-semibold">Rol legacy</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Rol RRHH</th>
              <th className="px-4 py-3 font-semibold">Cambiar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-gray-400">Sin usuarios</td></tr>
            ) : filtrados.map((u) => {
              const info = u.rol_rrhh ? ROLES_INFO.find((x) => x.v === u.rol_rrhh) : null;
              const legacyBadge = u.rol ? LEGACY_BADGE[u.rol] ?? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-400";
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{u.nombre ?? "—"}</div>
                    <div className="text-xs text-slate-500 font-mono">{u.email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${legacyBadge}`}>
                      {u.rol ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${u.estado === "activo" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {u.estado ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {info ? (
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${info.badge}`}>{info.label}</span>
                    ) : (
                      <span className="text-xs text-slate-400">— (fallback legacy)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.rol_rrhh ?? ""}
                        disabled={saving[u.id]}
                        onChange={(e) => cambiarRol(u, (e.target.value || null) as RolRrhh)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm min-w-[180px]"
                      >
                        <option value="">— sin rol RRHH —</option>
                        {ROLES_INFO.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
                      </select>
                      {saving[u.id] && <span className="text-xs text-slate-500">Guardando…</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
