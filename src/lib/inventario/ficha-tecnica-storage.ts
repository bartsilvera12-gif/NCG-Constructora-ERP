/**
 * Storage helper para fichas técnicas (PDF) de cada producto.
 * Bucket privado `productos-fichas-tecnicas`.
 * Path: {empresa_id}/{producto_id}/ficha.pdf
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const PRODUCTOS_FICHAS_BUCKET = "productos-fichas-tecnicas";
export const FICHA_MIME = "application/pdf";
export const MAX_FICHA_BYTES = 15 * 1024 * 1024;

let bucketEnsured = false;
export async function ensureFichasBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data } = await supabase.storage.getBucket(PRODUCTOS_FICHAS_BUCKET);
    if (data) { bucketEnsured = true; return; }
  } catch {}
  const { error } = await supabase.storage.createBucket(PRODUCTOS_FICHAS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FICHA_BYTES,
    allowedMimeTypes: [FICHA_MIME],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`No se pudo crear el bucket de fichas técnicas: ${error.message}`);
  }
  bucketEnsured = true;
}

export function buildFichaPath(empresaId: string, productoId: string): string {
  return `${empresaId}/${productoId}/ficha.pdf`;
}

export async function signFicha(
  supabase: AppSupabaseClient,
  path: string | null | undefined,
  ttlSeconds = 3600
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(PRODUCTOS_FICHAS_BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch { return null; }
}

export function pathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  return path.split("/")[0] === empresaId;
}
