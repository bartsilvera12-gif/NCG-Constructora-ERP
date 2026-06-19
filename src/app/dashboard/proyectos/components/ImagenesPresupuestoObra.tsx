"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Imagen = {
  id: string;
  nombre: string;
  url: string | null;
  orden: number;
};

/**
 * Lista de imágenes cargadas durante el alta del presupuesto origen de
 * esta obra. Solo lectura: las altas/bajas se gestionan desde el módulo
 * de presupuestos (no se pueden modificar una vez aprobada la obra).
 */
export default function ImagenesPresupuestoObra({ ventaId }: { ventaId: string }) {
  const [imagenes, setImagenes] = useState<Imagen[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Imagen | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/ventas/${ventaId}/imagenes`);
      const j = await r.json();
      if (j.success) setImagenes(j.data?.imagenes ?? []);
      else setErr(j.error ?? "No se pudieron cargar las imágenes.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setLoading(false);
    }
  }, [ventaId]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Fotos cargadas durante el alta del presupuesto. Para modificarlas, editá el presupuesto origen.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : err ? (
        <p className="text-sm text-rose-600">{err}</p>
      ) : imagenes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          El presupuesto no tiene imágenes adjuntas.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {imagenes.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setPreview(img)}
              className="group rounded-lg border border-slate-200 bg-white overflow-hidden text-left hover:border-slate-300 hover:shadow-md transition"
            >
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
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {preview.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.nombre} className="max-h-[88vh] max-w-[88vw] object-contain rounded-lg" />
            )}
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute -top-3 -right-3 bg-white text-slate-700 rounded-full shadow w-8 h-8 flex items-center justify-center text-lg"
              aria-label="Cerrar"
            >
              ×
            </button>
            <p className="absolute -bottom-7 left-0 right-0 text-center text-xs text-white/80">{preview.nombre}</p>
          </div>
        </div>
      )}
    </div>
  );
}
