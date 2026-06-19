"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface FichaState {
  url: string | null;
  nombre: string | null;
}

/**
 * Input para gestionar la ficha técnica PDF de un producto. Se usa tanto en
 * la edición de un producto existente (sube/borra contra la API) como en el
 * alta (en modo `deferred`, solo emite el File y el padre lo sube luego de
 * crear el producto).
 */
interface Props {
  /** Producto existente: sube/borra directamente. */
  productoId?: string;
  /** Alta diferida: el padre toma el File y lo sube despues. */
  onFileDeferred?: (file: File | null) => void;
}

export default function FichaTecnicaField({ productoId, onFileDeferred }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [actual, setActual] = useState<FichaState>({ url: null, nombre: null });
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!productoId) return;
    try {
      const r = await fetchWithSupabaseSession(`/api/productos/${productoId}/ficha-tecnica`);
      const j = await r.json();
      if (j.success && j.data) {
        setActual({ url: j.data.ficha_tecnica_url ?? null, nombre: j.data.ficha_tecnica_nombre ?? null });
      }
    } catch {}
  }, [productoId]);

  useEffect(() => { cargar(); }, [cargar]);

  function pickFile(file: File | null) {
    setErr(null);
    if (!file) {
      setPending(null);
      onFileDeferred?.(null);
      return;
    }
    if (file.type !== "application/pdf") { setErr("Solo se permiten archivos PDF."); return; }
    if (file.size > 15 * 1024 * 1024) { setErr("La ficha no puede superar 15 MB."); return; }
    setPending(file);
    onFileDeferred?.(file);
  }

  async function subir() {
    if (!productoId || !pending) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", pending);
      const r = await fetchWithSupabaseSession(`/api/productos/${productoId}/ficha-tecnica`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (j.success && j.data) {
        setActual({ url: j.data.ficha_tecnica_url ?? null, nombre: j.data.ficha_tecnica_nombre ?? null });
        setPending(null);
      } else {
        setErr(j.error ?? "No se pudo subir la ficha.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setBusy(false);
    }
  }

  async function borrar() {
    if (!productoId || !actual.url) return;
    if (!confirm("¿Quitar la ficha técnica?")) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/productos/${productoId}/ficha-tecnica`, { method: "DELETE" });
      const j = await r.json();
      if (j.success) setActual({ url: null, nombre: null });
      else setErr(j.error ?? "No se pudo borrar.");
    } finally {
      setBusy(false);
    }
  }

  const hayFicha = !!actual.url;
  const deferred = !productoId;

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="w-28 h-28 rounded-xl bg-rose-50 border border-rose-200 flex flex-col items-center justify-center overflow-hidden shrink-0">
          {hayFicha || pending ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-9 h-9 text-rose-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="text-[10px] font-semibold text-rose-700 mt-1">PDF</span>
            </>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-9 h-9 text-slate-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          )}
        </div>
        <div className="flex-1">
          {hayFicha && (
            <p className="text-sm text-slate-700 mb-2 flex items-center gap-2 flex-wrap">
              <a href={actual.url!} target="_blank" rel="noopener" className="text-[#0EA5E9] font-medium hover:underline">
                {actual.nombre ?? "Ver ficha actual"}
              </a>
              {!deferred && (
                <button type="button" onClick={borrar} disabled={busy}
                  className="text-xs text-rose-600 hover:underline disabled:opacity-50">
                  Quitar
                </button>
              )}
            </p>
          )}
          {pending && (
            <p className="text-sm text-slate-700 mb-2 flex items-center gap-2 flex-wrap">
              <span className="text-slate-600">📎 {pending.name}</span>
              {!deferred && (
                <button type="button" onClick={subir} disabled={busy}
                  className="text-xs px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white">
                  {busy ? "Subiendo…" : "Subir ahora"}
                </button>
              )}
              <button type="button" onClick={() => pickFile(null)} disabled={busy}
                className="text-xs text-slate-500 hover:underline">
                Quitar
              </button>
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm px-4 py-2 rounded-lg cursor-pointer transition-colors">
              {hayFicha || pending ? "Cambiar PDF" : "Seleccionar PDF"}
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            PDF — máx. 15 MB. Se mostrará como ficha técnica del producto en presupuestos y facturas (normativa ES).
          </p>
          {err && <p className="mt-1.5 text-xs text-rose-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}
