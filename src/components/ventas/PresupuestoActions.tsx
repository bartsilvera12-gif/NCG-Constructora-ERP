"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Tipo = "venta" | "presupuesto";
type Estado = "pendiente" | "aprobado" | "rechazado" | "convertido" | null;

type ConfirmTone = "primary" | "teal";
type ConfirmPrompt = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: ConfirmTone;
  onConfirm: () => Promise<void> | void;
};

/**
 * Render del badge + acciones para tipo_documento / estado_presupuesto de una venta.
 *
 * - Si tipo='venta': solo badge "Venta directa". No se puede convertir a
 *   presupuesto después: una venta real ya descontó stock y generó movimientos.
 *   El presupuesto debe nacer desde "Nuevo presupuesto de obra".
 * - Si tipo='presupuesto':
 *    - badge "Presupuesto de obra" + badge de estado.
 *    - pendiente → [Aprobar y crear obra] [Rechazar]. Aprobar es un solo paso:
 *      marca el presupuesto como aprobado, crea la obra automáticamente y
 *      navega al detalle del proyecto. No queda estado intermedio "aprobado
 *      sin obra".
 *    - aprobado  → [Convertir en obra] (fallback para presupuestos legados
 *      que quedaron en este estado antes de unificar el flujo).
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
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPrompt | null>(null);

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

  function pedirConfirmConvertir() {
    setConfirmPrompt({
      title: "Convertir en obra",
      message: "Se creará una nueva obra a partir de este presupuesto y quedarán vinculados. Esta acción no se puede deshacer.",
      confirmLabel: "Crear obra",
      tone: "teal",
      onConfirm: ejecutarConvertir,
    });
  }

  async function ejecutarConvertir() {
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
        window.location.href = `/dashboard/proyectos/${proy.id}`;
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Aprobar = marcar aprobado + crear la obra inmediatamente, en un solo paso.
   * El usuario nunca ve el estado "aprobado pero sin obra"; al aceptar el
   * presupuesto ya queda como proyecto activo.
   */
  function pedirConfirmAprobar() {
    setConfirmPrompt({
      title: "Aprobar y crear obra",
      message: "El presupuesto se aprobará y se creará la obra inmediatamente. Pasarás al detalle del proyecto.",
      confirmLabel: "Aprobar y crear obra",
      tone: "primary",
      onConfirm: ejecutarAprobarYCrearObra,
    });
  }

  async function ejecutarAprobarYCrearObra() {
    setBusy(true);
    setErr(null);
    try {
      // 1) Marcar aprobado (requisito del endpoint convertir-obra).
      const r1 = await fetchWithSupabaseSession(`/api/ventas/${id}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_presupuesto: "aprobado" }),
      });
      const j1 = (await r1.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!r1.ok || !j1.success) {
        setErr(j1.error ?? "No se pudo aprobar");
        return;
      }
      // 2) Crear la obra y vincular.
      const r2 = await fetchWithSupabaseSession(`/api/ventas/${id}/convertir-obra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j2 = (await r2.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { proyecto?: { id: string; titulo: string } } };
      if (!r2.ok || !j2.success) {
        // Quedó aprobado pero no convertido. El botón "Convertir en obra"
        // del estado 'aprobado' permite reintentar manualmente.
        setErr(`Aprobado, pero falló crear la obra: ${j2.error ?? "error desconocido"}. Reintentá desde "Convertir en obra".`);
        router.refresh();
        return;
      }
      const proy = j2.data?.proyecto;
      if (proy?.id) {
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
              onClick={pedirConfirmAprobar}
              title="Aprobar el presupuesto y crear la obra inmediatamente"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              Aprobar y crear obra
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
            onClick={pedirConfirmConvertir}
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

      {confirmPrompt && (
        <ConfirmModal
          title={confirmPrompt.title}
          message={confirmPrompt.message}
          confirmLabel={confirmPrompt.confirmLabel}
          tone={confirmPrompt.tone}
          busy={busy}
          onCancel={() => setConfirmPrompt(null)}
          onConfirm={async () => {
            const fn = confirmPrompt.onConfirm;
            setConfirmPrompt(null);
            await fn();
          }}
        />
      )}
    </div>
  );
}

/**
 * Diálogo de confirmación inline (en la página, no es el confirm() nativo).
 * Cierra con Escape o clic en el backdrop. El botón "Confirmar" se deshabilita
 * cuando la acción está en curso (`busy=true`).
 */
function ConfirmModal({
  title, message, confirmLabel, tone, busy, onCancel, onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  tone: ConfirmTone;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const confirmClasses = tone === "primary"
    ? "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500 border-emerald-700"
    : "bg-[#3F8E91] hover:bg-[#2F6F72] focus:ring-[#4FAEB2] border-[#2F6F72]";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4"
      onClick={() => { if (!busy) onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {busy && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                <path d="M17 10a7 7 0 0 1-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
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
