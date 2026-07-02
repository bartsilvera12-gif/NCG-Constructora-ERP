import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_ARCHIVO_MIME,
  MAX_ARCHIVO_BYTES,
  EMPLEADO_ARCHIVOS_BUCKET,
  ensureEmpleadoArchivosBucket,
  signEmpleadoArchivo,
} from "@/lib/rrhh/empleado-archivos-storage";

/**
 * Archivo PDF/imagen adjunto a una factura España (Fase J).
 * Reutiliza el bucket empleado-archivos con carpeta `facturas/`, mismo patrón
 * que cursos. GET devuelve URL firmada. POST sube (multipart). DELETE borra.
 */

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "application/pdf": "pdf",
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const { id } = await params;
  const { data, error } = await ctx.supabase
    .from("facturas")
    .select("archivo_storage_bucket, archivo_storage_path, cif_nif_receptor")
    .eq("id", id).eq("empresa_id", ctx.auth.empresa_id).maybeSingle();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
  if (!data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
  const row = data as { archivo_storage_bucket: string | null; archivo_storage_path: string | null };
  if (!row.archivo_storage_path) return NextResponse.json(successResponse({ url: null }));
  const url = await signEmpleadoArchivo(ctx.supabase, row.archivo_storage_path, 3600);
  return NextResponse.json(successResponse({ url }));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const empresaId = ctx.auth.empresa_id;

    const form = await request.formData();
    const raw = form.get("file");
    if (!(raw instanceof File) || raw.size === 0) return NextResponse.json(errorResponse("Falta el archivo"), { status: 400 });
    const file = raw;

    if (!ALLOWED_ARCHIVO_MIME.has(file.type)) return NextResponse.json(errorResponse(`Formato no permitido (${file.type})`), { status: 400 });
    if (file.size > MAX_ARCHIVO_BYTES) return NextResponse.json(errorResponse(`Archivo demasiado grande (máx. ${(MAX_ARCHIVO_BYTES/1024/1024)|0} MB)`), { status: 400 });

    await ensureEmpleadoArchivosBucket(ctx.supabase);
    const ext = EXT_BY_MIME[file.type] ?? "bin";
    const path = `${empresaId}/facturas/${id}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await ctx.supabase.storage
      .from(EMPLEADO_ARCHIVOS_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });

    const upd = await ctx.supabase
      .from("facturas")
      .update({
        archivo_storage_bucket: EMPLEADO_ARCHIVOS_BUCKET,
        archivo_storage_path: path,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id).eq("empresa_id", empresaId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });

    const url = await signEmpleadoArchivo(ctx.supabase, path, 3600);
    return NextResponse.json(successResponse({ url, path }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const { id } = await params;
  const sel = await ctx.supabase
    .from("facturas").select("archivo_storage_bucket, archivo_storage_path")
    .eq("id", id).eq("empresa_id", ctx.auth.empresa_id).maybeSingle();
  if (sel.error) return NextResponse.json(errorResponse(sel.error.message), { status: 400 });
  const row = sel.data as { archivo_storage_bucket: string | null; archivo_storage_path: string | null } | null;
  if (row?.archivo_storage_path) {
    await ctx.supabase.storage.from(row.archivo_storage_bucket || EMPLEADO_ARCHIVOS_BUCKET).remove([row.archivo_storage_path]);
  }
  await ctx.supabase.from("facturas")
    .update({ archivo_storage_bucket: null, archivo_storage_path: null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("empresa_id", ctx.auth.empresa_id);
  return NextResponse.json(successResponse({ ok: true }));
}
