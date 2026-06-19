import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  FICHA_MIME,
  MAX_FICHA_BYTES,
  PRODUCTOS_FICHAS_BUCKET,
  buildFichaPath,
  ensureFichasBucket,
  pathBelongsToEmpresa,
  signFicha,
} from "@/lib/inventario/ficha-tecnica-storage";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

async function fetchProducto(
  sb: AppSupabaseClient,
  empresaId: string,
  productoId: string
): Promise<{ id: string; ficha_tecnica_path: string | null; ficha_tecnica_nombre: string | null } | null> {
  const { data, error } = await sb
    .from("productos")
    .select("id, ficha_tecnica_path, ficha_tecnica_nombre")
    .eq("empresa_id", empresaId)
    .eq("id", productoId)
    .maybeSingle();
  if (error) return null;
  return (data as { id: string; ficha_tecnica_path: string | null; ficha_tecnica_nombre: string | null } | null) ?? null;
}

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const prod = await fetchProducto(ctx.supabase, ctx.auth.empresa_id, productoId);
    if (!prod) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const signed = prod.ficha_tecnica_path ? await signFicha(ctx.supabase, prod.ficha_tecnica_path, 3600) : null;
    return NextResponse.json(successResponse({
      ficha_tecnica_path: prod.ficha_tecnica_path,
      ficha_tecnica_nombre: prod.ficha_tecnica_nombre,
      ficha_tecnica_url: signed,
    }));
  } catch (err) {
    console.error("[productos/ficha-tecnica GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo obtener la ficha."), { status: 500 });
  }
}

export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const prod = await fetchProducto(supabase, empresaId, productoId);
    if (!prod) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (file.type !== FICHA_MIME) {
      return NextResponse.json(errorResponse("Solo se permiten archivos PDF."), { status: 400 });
    }
    if (file.size > MAX_FICHA_BYTES) {
      const mb = (MAX_FICHA_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(errorResponse(`La ficha no puede superar ${mb} MB.`), { status: 400 });
    }

    try { await ensureFichasBucket(supabase); } catch {}

    const path = buildFichaPath(empresaId, productoId);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(PRODUCTOS_FICHAS_BUCKET)
      .upload(path, buf, { contentType: FICHA_MIME, upsert: true });
    if (up.error) {
      return NextResponse.json(errorResponse(`Fallo al subir: ${up.error.message}`), { status: 500 });
    }

    const upd = await supabase
      .from("productos")
      .update({ ficha_tecnica_path: path, ficha_tecnica_nombre: file.name })
      .eq("id", productoId)
      .eq("empresa_id", empresaId);
    if (upd.error) {
      return NextResponse.json(errorResponse(upd.error.message), { status: 500 });
    }

    const signed = await signFicha(supabase, path, 3600);
    return NextResponse.json(successResponse({
      ficha_tecnica_path: path,
      ficha_tecnica_nombre: file.name,
      ficha_tecnica_url: signed,
    }));
  } catch (err) {
    console.error("[productos/ficha-tecnica POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir la ficha."), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const prod = await fetchProducto(supabase, empresaId, productoId);
    if (!prod) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    if (prod.ficha_tecnica_path && pathBelongsToEmpresa(prod.ficha_tecnica_path, empresaId)) {
      await supabase.storage.from(PRODUCTOS_FICHAS_BUCKET).remove([prod.ficha_tecnica_path]);
    }
    const upd = await supabase
      .from("productos")
      .update({ ficha_tecnica_path: null, ficha_tecnica_nombre: null })
      .eq("id", productoId)
      .eq("empresa_id", empresaId);
    if (upd.error) {
      return NextResponse.json(errorResponse(upd.error.message), { status: 500 });
    }
    return NextResponse.json(successResponse({ deleted: true }));
  } catch (err) {
    console.error("[productos/ficha-tecnica DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo borrar la ficha."), { status: 500 });
  }
}
