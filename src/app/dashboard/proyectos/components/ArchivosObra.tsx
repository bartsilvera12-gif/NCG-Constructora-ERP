"use client";

/**
 * Galería de archivos / fotos para un proyecto.
 *
 * - Drag & drop o file picker (multi).
 * - Las imágenes se muestran como thumbnails con preview a tamaño full en
 *   modal al hacer click; los demás documentos como tarjeta con icono.
 * - Botón "Eliminar" por archivo con confirmación inline.
 *
 * Fuente: GET/POST/DELETE /api/proyectos/[id]/archivos. Las URLs vienen
 * firmadas con TTL 1h; si el usuario tarda más se vuelven a pedir al recargar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface Archivo {
  id: string;
  nombre: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
}

function esImagen(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

function formatBytes(n: number | null): string {
  if (!n || n < 1024) return `${n ?? 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export default function ArchivosObra({ projectId }: { projectId: string }) {
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [dragActivo, setDragActivo] = useState(false);
  const [preview, setPreview] = useState<Archivo | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos`, { cache: "no-store" });
      const j = (await r.json()) as { success?: boolean; data?: { archivos?: Archivo[] }; error?: string };
      if (!r.ok || !j.success) {
        setErr(j.error ?? "No se pudieron cargar los archivos");
        return;
      }
      setArchivos(j.data?.archivos ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function subir(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setSubiendo(true);
    setErr(null);
    try {
      const fd = new FormData();
      for (const f of arr) fd.append("file", f);
      const r = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos`, {
        method: "POST",
        body: fd,
      });
      const j = (await r.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { creados?: Archivo[]; errores?: string[] };
        error?: string;
      };
      if (!r.ok || !j.success) {
        setErr(j.error ?? "No se pudieron subir los archivos");
        return;
      }
      if (j.data?.errores?.length) setErr(j.data.errores.join(" "));
      // Recargamos para tener URLs firmadas + orden por fecha consistente.
      await cargar();
    } finally {
      setSubiendo(false);
    }
  }

  async function eliminar(a: Archivo) {
    if (!confirm(`¿Eliminar "${a.nombre}"? Esta acción no se puede deshacer.`)) return;
    setBorrandoId(a.id);
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/archivos?archivoId=${encodeURIComponent(a.id)}`,
        { method: "DELETE" }
      );
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!r.ok || !j.success) {
        setErr(j.error ?? "No se pudo eliminar el archivo");
        return;
      }
      setArchivos((prev) => prev.filter((x) => x.id !== a.id));
    } finally {
      setBorrandoId(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActivo(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void subir(e.dataTransfer.files);
    }
  }

  return (
    <div className="space-y-4">
      {/* Zona de upload (file picker + drag&drop). */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActivo(true); }}
        onDragLeave={() => setDragActivo(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors ${
          dragActivo ? "border-[#4FAEB2] bg-[#E5F4F4]" : "border-slate-300 bg-slate-50"
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-10 w-10 text-slate-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          <p className="text-sm text-slate-700">
            Arrastrá tus fotos o documentos acá, o
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo}
              className="ml-1 font-semibold text-[#3F8E91] hover:text-[#2F6F72] underline disabled:opacity-50"
            >
              elegí archivos
            </button>
          </p>
          <p className="text-xs text-slate-500">
            JPG, PNG, WebP, GIF, HEIC, PDF, Word, Excel, TXT, CSV — hasta 25 MB cada uno.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            className="hidden"
            onChange={(e) => { if (e.target.files) void subir(e.target.files); e.target.value = ""; }}
          />
          {subiendo && (
            <p className="text-xs text-[#3F8E91] inline-flex items-center gap-1.5 mt-1">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                <path d="M17 10a7 7 0 0 1-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Subiendo…
            </p>
          )}
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {err}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando archivos…</p>
      ) : archivos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">
          Esta obra todavía no tiene archivos cargados.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {archivos.map((a) => {
            const img = esImagen(a.mime_type);
            return (
              <div
                key={a.id}
                className="group relative rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {img && a.url ? (
                  <button
                    type="button"
                    onClick={() => setPreview(a)}
                    className="block w-full aspect-square bg-slate-100 overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.nombre} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  </button>
                ) : (
                  <a
                    href={a.url ?? "#"}
                    target="_blank"
                    rel="noopener"
                    className="flex w-full aspect-square items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-100"
                    title={a.url ? "Abrir archivo" : "Sin URL disponible"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </a>
                )}
                <div className="px-2 py-2 border-t border-slate-100">
                  <p className="text-[11px] font-medium text-slate-700 truncate" title={a.nombre}>{a.nombre}</p>
                  <p className="text-[10px] text-slate-400">
                    {formatBytes(a.size_bytes)} · {formatFecha(a.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => eliminar(a)}
                  disabled={borrandoId === a.id}
                  title="Eliminar archivo"
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/90 backdrop-blur p-1 text-red-600 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover:opacity-100 disabled:opacity-50"
                >
                  {borrandoId === a.id ? (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                      <path d="M17 10a7 7 0 0 1-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.585.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            {preview.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview.url} alt={preview.nombre} className="max-h-[85vh] mx-auto rounded-lg shadow-2xl" />
            ) : null}
            <div className="text-center mt-3 text-white text-sm">
              <p className="font-medium">{preview.nombre}</p>
              <p className="text-xs text-white/70 mt-1">{formatBytes(preview.size_bytes)}</p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="mt-3 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
