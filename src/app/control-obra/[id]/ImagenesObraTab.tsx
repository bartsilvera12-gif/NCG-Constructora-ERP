"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import ImagenesPresupuestoObra from "@/app/dashboard/proyectos/components/ImagenesPresupuestoObra";

type Archivo = {
  id: string;
  nombre: string;
  mime_type: string | null;
  url: string | null;
};

const IMG_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
]);

/**
 * Tab "Imágenes" en /control-obra/[id]: muestra dos bloques.
 *
 * 1) Imágenes del presupuesto origen (read-only) — cargadas al alta.
 * 2) Avance de obra — fotos subidas directamente a la obra (antes/durante/
 *    después). Drag&drop + cámara. Las no-imagen de proyecto_archivos no se
 *    muestran acá (esas viven en el tab "Archivos" del módulo Proyectos).
 */
export default function ImagenesObraTab({
  projectId,
  presupuestoOrigenId,
}: {
  projectId: string;
  presupuestoOrigenId: string | null;
}) {
  return (
    <div className="space-y-6">
      {presupuestoOrigenId ? (
        <Bloque titulo="Del presupuesto" subtitulo="Fotos cargadas durante el alta del presupuesto (solo lectura).">
          <ImagenesPresupuestoObra ventaId={presupuestoOrigenId} />
        </Bloque>
      ) : null}

      <Bloque
        titulo="Avance de obra"
        subtitulo="Fotos del antes, durante y después. Se guardan en los archivos de la obra."
      >
        <AvanceObraGaleria projectId={projectId} />
      </Bloque>
    </div>
  );
}

function Bloque({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function AvanceObraGaleria({ projectId }: { projectId: string }) {
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Archivo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos`);
      const j = await r.json();
      if (j.success) {
        const todos = (j.data?.archivos ?? []) as Archivo[];
        setArchivos(todos.filter((a) => a.mime_type && IMG_MIMES.has(a.mime_type)));
      } else {
        setErr(j.error ?? "No se pudieron cargar las fotos.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { cargar(); }, [cargar]);

  const subir = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("file", f, f.name));
      const r = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (!j.success) setErr(j.error ?? "Error al subir.");
      else if (j.data?.errores?.length) setErr((j.data.errores as string[]).join(" · "));
      await cargar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setUploading(false);
    }
  };

  const borrar = async (archivoId: string) => {
    if (!confirm("¿Borrar esta foto?")) return;
    try {
      await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos?archivoId=${archivoId}`, { method: "DELETE" });
      setArchivos((arr) => arr.filter((a) => a.id !== archivoId));
    } catch {}
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); subir(e.dataTransfer.files); }}
      >
        <p className="text-sm text-slate-600 mb-2">
          Arrastrá fotos o usá los botones.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Subir foto
          </button>
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Tomar foto
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
          multiple
          className="hidden"
          onChange={(e) => { subir(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { subir(e.target.files); e.target.value = ""; }}
        />
        {uploading && <p className="mt-2 text-xs text-slate-500">Subiendo…</p>}
      </div>

      {err && <p className="text-xs text-rose-600">{err}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : archivos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          Todavía no hay fotos de avance. Subí la primera.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {archivos.map((a) => (
            <div key={a.id} className="relative group rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button type="button" onClick={() => setPreview(a)} className="block w-full">
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.nombre} className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="aspect-[4/3] w-full bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    Sin previa
                  </div>
                )}
              </button>
              <div className="p-2">
                <p className="text-xs font-medium text-slate-700 truncate" title={a.nombre}>{a.nombre}</p>
              </div>
              <button
                type="button"
                onClick={() => borrar(a.id)}
                className="absolute top-1.5 right-1.5 rounded-md bg-white/90 text-rose-600 text-xs px-2 py-0.5 shadow opacity-0 group-hover:opacity-100 transition"
              >
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {preview.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.nombre} className="max-h-[88vh] max-w-[88vw] object-contain rounded-lg" />
            )}
            <button type="button" onClick={() => setPreview(null)}
              className="absolute -top-3 -right-3 bg-white text-slate-700 rounded-full shadow w-8 h-8 flex items-center justify-center text-lg">
              ×
            </button>
            <p className="absolute -bottom-7 left-0 right-0 text-center text-xs text-white/80">{preview.nombre}</p>
          </div>
        </div>
      )}
    </div>
  );
}
