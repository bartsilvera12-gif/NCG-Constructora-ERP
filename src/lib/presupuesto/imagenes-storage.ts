/**
 * Storage helper para imagenes adjuntas a un presupuesto/venta.
 * Bucket privado `presupuesto-imagenes`. Path: {empresa_id}/{venta_id}/{img_id}.{ext}.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const PRESUPUESTO_IMAGENES_BUCKET = "presupuesto-imagenes";

export const ALLOWED_IMAGEN_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

export const MAX_IMAGEN_BYTES = 15 * 1024 * 1024;

let bucketEnsured = false;
export async function ensurePresupuestoImagenesBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(PRESUPUESTO_IMAGENES_BUCKET);
    if (existing) { bucketEnsured = true; return; }
  } catch {}
  const { error } = await supabase.storage.createBucket(PRESUPUESTO_IMAGENES_BUCKET, {
    public: false,
    fileSizeLimit: MAX_IMAGEN_BYTES,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`No se pudo crear el bucket de imagenes: ${error.message}`);
  }
  bucketEnsured = true;
}

export function buildImagenPath(opts: {
  empresaId: string; ventaId: string; imagenId: string; mime: string;
}): string {
  const ext = MIME_TO_EXT[opts.mime] ?? "bin";
  return `${opts.empresaId}/${opts.ventaId}/${opts.imagenId}.${ext}`;
}

export async function signImagen(
  supabase: AppSupabaseClient,
  path: string | null | undefined,
  ttlSeconds = 3600
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(PRESUPUESTO_IMAGENES_BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export function pathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  return path.split("/")[0] === empresaId;
}
