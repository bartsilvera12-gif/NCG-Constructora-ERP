"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Imagen = {
  id: string;
  nombre: string;
  url: string | null;
  size_bytes: number | null;
  orden: number;
};

interface Props {
  ventaId: string;
  onClose: () => void;
}

export default function PresupuestoImagenesModal({ ventaId, onClose }: Props) {
  const [imagenes, setImagenes] = useState<Imagen[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/ventas/${ventaId}/imagenes`);
      const j = await r.json();
      if (j.success) setImagenes(j.data?.imagenes ?? []);
      else setErr(j.error ?? "Error al cargar");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [ventaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const subir = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("file", f));
      const r = await fetchWithSupabaseSession(`/api/ventas/${ventaId}/imagenes`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (!j.success) {
        setErr(j.error ?? "Error al subir");
      } else if (j.data?.errores?.length) {
        setErr((j.data.errores as string[]).join(" · "));
      }
      await cargar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red");
    } finally {
      setUploading(false);
    }
  }, [ventaId, cargar]);

  const borrar = async (imagenId: string) => {
    if (!confirm("¿Borrar esta imagen?")) return;
    try {
      await fetchWithSupabaseSession(`/api/ventas/${ventaId}/imagenes?imagenId=${imagenId}`, { method: "DELETE" });
      setImagenes((imgs) => imgs.filter((i) => i.id !== imagenId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al borrar");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    subir(e.dataTransfer.files);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">Imágenes del presupuesto</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center cursor-pointer hover:bg-slate-100 transition"
            onClick={() => inputRef.current?.click()}
          >
            <p className="text-sm text-slate-600">
              Arrastrá imágenes o <span className="text-[#0EA5E9] font-medium">elegí archivos</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP, GIF, HEIC · hasta 15 MB c/u</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
              multiple
              hidden
              onChange={(e) => { subir(e.target.files); e.target.value = ""; }}
            />
          </div>

          {uploading && <p className="mt-3 text-xs text-slate-500">Subiendo…</p>}
          {err && <p className="mt-3 text-xs text-rose-600">{err}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 max-h-[50vh] overflow-y-auto">
            {loading ? (
              <p className="text-sm text-slate-500 col-span-full">Cargando…</p>
            ) : imagenes.length === 0 ? (
              <p className="text-sm text-slate-400 col-span-full">Sin imágenes adjuntas todavía.</p>
            ) : (
              imagenes.map((img) => (
                <div key={img.id} className="relative group rounded-lg border border-slate-200 bg-white overflow-hidden">
                  {img.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.url} alt={img.nombre} className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="aspect-[4/3] w-full bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                      Sin previa
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs font-medium text-slate-700 truncate" title={img.nombre}>{img.nombre}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => borrar(img.id)}
                    className="absolute top-1.5 right-1.5 rounded-md bg-white/90 text-rose-600 text-xs px-2 py-0.5 shadow opacity-0 group-hover:opacity-100 transition"
                  >
                    Borrar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
