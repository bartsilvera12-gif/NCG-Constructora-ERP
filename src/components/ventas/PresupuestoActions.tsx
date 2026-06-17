"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Tipo = "venta" | "presupuesto";
type Estado = "pendiente" | "aprobado" | "rechazado" | "convertido" | null;

/**
 * Render del badge + acciones para tipo_documento / estado_presupuesto de una venta.
 *
 * - Si tipo='venta': solo badge "Venta directa". No se puede convertir a
 *   presupuesto después: una venta real ya descontó stock y generó movimientos.
 *   El presupuesto debe nacer desde "Nuevo presupuesto de obra".
 * - Si tipo='presupuesto':
 *    - badge "Presupuesto de obra" + badge de estado.
 *    - pendiente → botones [Aprobar] [Rechazar].
 *    - aprobado  → botón [Convertir en obra].
 *    - convertido → link [Ver obra].
 *    - rechazado  → solo badge.
 */
export default function PresupuestoActions({
  id,
  tipo,
  estado,
  proyectoId,
}: {
  id: string;
  tipo: Tipo;
  estado: Estado;
  /** Si está vinculado a una obra (después de convertir), se usa para el botón "Ver obra". */
  proyectoId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patchWorkflow(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/ventas/${id}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!r.ok || !j.success) {
        setErr(j.error ?? "No se pudo actualizar");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function convertir() {
    if (!confirm("¿Convertir este presupuesto en obra? Se creará una nueva obra y el presupuesto quedará vinculado.")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/ventas/${id}/convertir-obra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { proyecto?: { id: string; titulo: string } } };
      if (!r.ok || !j.success) {
        setErr(j.error ?? "No se pudo convertir");
        return;
      }
      const proy = j.data?.proyecto;
      if (proy?.id) {
        // Llevar al usuario directo a la obra creada
        window.location.href = `/dashboard/proyectos/${proy.id}`;
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {tipo === "presupuesto" ? (
          <>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              Presupuesto de obra
            </span>
            {estado && <EstadoBadge estado={estado} />}
          </>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Venta directa
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tipo === "presupuesto" && estado === "pendiente" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => patchWorkflow({ estado_presupuesto: "aprobado" })}
              title="Aprobar este presupuesto"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              Aprobar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => patchWorkflow({ estado_presupuesto: "rechazado" })}
              title="Rechazar este presupuesto"
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-50 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
              Rechazar
            </button>
          </>
        )}

        {tipo === "presupuesto" && estado === "aprobado" && (
          <button
            type="button"
            disabled={busy}
            onClick={convertir}
            title="Crear una obra a partir de este presupuesto aprobado"
            className="inline-flex items-center gap-1 rounded-md border border-[#4FAEB2]/40 bg-[#E5F4F4] px-2.5 py-1 text-[11px] font-semibold text-[#3F8E91] shadow-sm transition-colors hover:bg-[#D2EBEB] hover:border-[#4FAEB2]/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm5.25 6.25a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v2.25h2.25a.75.75 0 0 1 0 1.5h-2.25v2.25a.75.75 0 0 1-1.5 0V12H7.5a.75.75 0 0 1 0-1.5h2.25V8.25Z" clipRule="evenodd" />
            </svg>
            Convertir en obra
          </button>
        )}

        {tipo === "presupuesto" && estado === "convertido" && proyectoId && (
          <a
            href={`/dashboard/proyectos/${proyectoId}`}
            title="Abrir la obra vinculada"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#3F8E91] shadow-sm transition-colors hover:bg-slate-50 hover:border-slate-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
            </svg>
            Ver obra
          </a>
        )}
      </div>

      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: Exclude<Estado, null> }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    pendiente:  { bg: "bg-amber-50",    text: "text-amber-700",    label: "Pendiente" },
    aprobado:   { bg: "bg-emerald-50",  text: "text-emerald-700",  label: "Aprobado" },
    rechazado:  { bg: "bg-red-50",      text: "text-red-700",      label: "Rechazado" },
    convertido: { bg: "bg-[#E5F4F4]",   text: "text-[#3F8E91]",    label: "Convertido" },
  };
  const c = cfg[estado] ?? cfg.pendiente;
  return (
    <span className={`rounded-full ${c.bg} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.text}`}>
      {c.label}
    </span>
  );
}
