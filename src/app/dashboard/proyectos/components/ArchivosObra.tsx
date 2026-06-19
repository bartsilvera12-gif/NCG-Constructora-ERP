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
  const [camOpen, setCamOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Archivo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGENES = 5;
  const cantImagenes = archivos.filter((a) => esImagen(a.mime_type)).length;
  const limiteAlcanzado = cantImagenes >= MAX_IMAGENES;


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
      for (const f of arr) {
        fd.append("file", f, f.name || "archivo");
      }
      const r = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos`, {
        method: "POST",
        body: fd,
      });
      const rawText = await r.text();
      let j: { success?: boolean; data?: { creados?: Archivo[]; errores?: string[] }; error?: string } = {};
      try { j = JSON.parse(rawText); } catch {}
      if (!r.ok || !j.success) {
        setErr(j.error ?? `HTTP ${r.status}: ${rawText.slice(0, 200) || "respuesta vacía"}`);
        return;
      }
      if (j.data?.errores?.length) setErr(j.data.errores.join(" "));
      await cargar();
    } catch (e) {
      setErr(`Error de red al subir: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubiendo(false);
    }
  }

  async function confirmarEliminar() {
    const a = confirmDelete;
    if (!a) return;
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
      setConfirmDelete(null);
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
      {err && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <strong>Error:</strong> {err}
        </div>
      )}
      {subiendo && (
        <div className="flex items-center gap-2 rounded-lg border border-[#4FAEB2] bg-[#E5F4F4] px-3 py-2 text-sm font-medium text-[#3F8E91]">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
            <path d="M17 10a7 7 0 0 1-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Subiendo archivo…
        </div>
      )}
      {/* Zona de upload (file picker + drag&drop). */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActivo(true); }}
        onDragLeave={() => setDragActivo(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors sm:px-6 sm:py-7 ${
          dragActivo ? "border-[#4FAEB2] bg-[#E5F4F4]" : "border-slate-300 bg-slate-50"
        }`}
      >
        <div className="flex flex-col items-center gap-1.5 sm:gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="hidden h-10 w-10 text-slate-400 sm:block">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          <p className="text-sm text-slate-700">
            <span className="hidden sm:inline">Arrastrá tus fotos o documentos acá, o usá </span>
            <span className="sm:hidden">Usá </span>
            los botones de abajo.
          </p>
          <p className="hidden text-xs text-slate-500 sm:block">
            JPG, PNG, WebP, GIF, HEIC, PDF, Word, Excel, TXT, CSV — hasta 25 MB cada uno.
          </p>
          <p className={`text-xs ${limiteAlcanzado ? "text-amber-600 font-semibold" : "text-slate-500"}`}>
            Imágenes: {cantImagenes}/{MAX_IMAGENES}{limiteAlcanzado ? " · límite alcanzado" : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {/* <label> con input adentro: el click nativo en el label abre el
                picker. Más robusto que ref.click() en Brave/Chrome mobile. */}
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 ${
                subiendo ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 5.75 5.75 0 0 1 1.011 11.094" />
              </svg>
              Subir archivo
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                className="sr-only"
                onChange={(e) => { if (e.target.files) void subir(e.target.files); e.target.value = ""; }}
              />
            </label>
            {/* En mobile: input nativo con capture abre la cámara del sistema.
                En desktop: el onClick abre el modal getUserMedia. */}
            <label
              onClick={(e) => {
                const esMobile =
                  typeof window !== "undefined" &&
                  window.matchMedia("(pointer: coarse)").matches;
                const tieneGUM =
                  typeof navigator !== "undefined" &&
                  !!navigator.mediaDevices &&
                  typeof navigator.mediaDevices.getUserMedia === "function";
                if (!esMobile && tieneGUM) {
                  e.preventDefault();
                  setCamOpen(true);
                }
              }}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 ${
                subiendo || limiteAlcanzado ? "pointer-events-none opacity-50" : ""
              }`}
              title={limiteAlcanzado ? "Límite de 5 imágenes alcanzado" : "Tomar foto con la cámara"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
              </svg>
              Tomar foto
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => { if (e.target.files) void subir(e.target.files); e.target.value = ""; }}
              />
            </label>
          </div>
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
                  onClick={() => setConfirmDelete(a)}
                  disabled={borrandoId === a.id}
                  title="Eliminar archivo"
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/90 backdrop-blur p-1.5 text-red-600 shadow-sm transition-opacity hover:bg-white disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
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

      {confirmDelete && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => borrandoId == null && setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">Eliminar archivo</h3>
                <p className="mt-1 text-sm text-slate-600">
                  ¿Querés eliminar <span className="font-medium text-slate-800 break-all">{confirmDelete.nombre}</span>?
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={borrandoId != null}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarEliminar()}
                disabled={borrandoId != null}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {borrandoId != null ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                      <path d="M17 10a7 7 0 0 1-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Eliminando…
                  </>
                ) : (
                  "Eliminar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {camOpen && (
        <CamaraModal
          onClose={() => setCamOpen(false)}
          onCapture={(file) => {
            setCamOpen(false);
            void subir([file]);
          }}
          onFallback={() => {
            setCamOpen(false);
            cameraRef.current?.click();
          }}
        />
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

function CamaraModal({
  onClose,
  onCapture,
  onFallback,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallback?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          // Esperar a que el video tenga dimensiones reales antes de habilitar
          // el botón Capturar — si no, el canvas sale 0x0 y el upload falla.
          await new Promise<void>((resolve) => {
            if (v.videoWidth > 0) return resolve();
            const onMeta = () => { v.removeEventListener("loadedmetadata", onMeta); resolve(); };
            v.addEventListener("loadedmetadata", onMeta);
          });
          await v.play().catch(() => {});
        }
        setListo(true);
      } catch (e) {
        setErr(
          e instanceof Error
            ? e.name === "NotAllowedError"
              ? "No se otorgó permiso para usar la cámara."
              : e.name === "NotFoundError"
              ? "No se detectó ninguna cámara."
              : e.message
            : "No se pudo acceder a la cámara."
        );
      }
    })();
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function capturar() {
    const video = videoRef.current;
    if (!video || !listo) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setErr("La cámara aún no está lista. Esperá un segundo y volvé a intentar.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setErr("El navegador no soporta canvas 2D.");
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          setErr("No se pudo capturar la foto (blob vacío).");
          return;
        }
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const file = new File([blob], `foto-${ts}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-slate-900/90 p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar cámara"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>

      <div className="w-full max-w-3xl">
        {err ? (
          <div className="rounded-lg bg-white p-6 text-center">
            <p className="text-sm text-rose-600">{err}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              {onFallback ? (
                <button
                  type="button"
                  onClick={onFallback}
                  className="rounded-md bg-[#4FAEB2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3F8E91]"
                >
                  Usar cámara del sistema
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="block w-full max-h-[70vh] object-contain"
              />
            </div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={capturar}
                disabled={!listo}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                  <path fillRule="evenodd" d="M3.5 5A1.5 1.5 0 0 1 5 3.5h1l1-1.5h6l1 1.5h1A1.5 1.5 0 0 1 16.5 5v9A1.5 1.5 0 0 1 15 15.5H5A1.5 1.5 0 0 1 3.5 14V5Zm6.5 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" clipRule="evenodd" />
                </svg>
                Capturar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
