import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import {
  ALLOWED_IMAGEN_MIME,
  MAX_IMAGEN_BYTES,
  PRESUPUESTO_IMAGENES_BUCKET,
  buildImagenPath,
  ensurePresupuestoImagenesBucket,
  pathBelongsToEmpresa,
  signImagen,
} from "@/lib/presupuesto/imagenes-storage";

/**
 *  GET    /api/ventas/[id]/imagenes              → lista + URLs firmadas (1h)
 *  POST   /api/ventas/[id]/imagenes              → sube (multipart, campo "file")
 *  DELETE /api/ventas/[id]/imagenes?imagenId=...
 */

async function ownsVenta(sb: AppSupabaseClient, empresaId: string, ventaId: string): Promise<boolean> {
  const { data } = await sb.from("ventas").select("id").eq("empresa_id", empresaId).eq("id", ventaId).maybeSingle();
  return !!data;
}

type Row = {
  id: string;
  nombre: string;
  mime: string | null;
  size_bytes: number | null;
  storage_path: string;
  orden: number;
  created_at: string;
};

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id: ventaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    if (!(await ownsVenta(ctx.supabase, empresaId, ventaId))) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }
    const { data, error } = await ctx.supabase
      .from("presupuesto_imagenes")
      .select("id, nombre, mime, size_bytes, storage_path, orden, created_at")
      .eq("empresa_id", empresaId)
      .eq("venta_id", ventaId)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    const rows = (data ?? []) as Row[];
    const imagenes = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      nombre: r.nombre,
      mime: r.mime,
      size_bytes: r.size_bytes,
      orden: r.orden,
      created_at: r.created_at,
      url: await signImagen(ctx.supabase, r.storage_path, 3600),
    })));
    return NextResponse.json(successResponse({ imagenes }));
  } catch (err) {
    console.error("[ventas/imagenes GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron listar las imagenes."), { status: 500 });
  }
}

export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id: ventaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    if (!(await ownsVenta(supabase, empresaId, ventaId))) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    const form = await request.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }

    try { await ensurePresupuestoImagenesBucket(supabase); } catch {}

    // Próximo orden = max(orden) + 1.
    const { data: maxRow } = await supabase
      .from("presupuesto_imagenes")
      .select("orden")
      .eq("empresa_id", empresaId)
      .eq("venta_id", ventaId)
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextOrden = ((maxRow as { orden: number } | null)?.orden ?? -1) + 1;

    const errores: string[] = [];
    const creados: Array<Record<string, unknown>> = [];

    for (const file of files) {
      if (!ALLOWED_IMAGEN_MIME.has(file.type)) {
        errores.push(`"${file.name}": formato no permitido.`);
        continue;
      }
      if (file.size > MAX_IMAGEN_BYTES) {
        errores.push(`"${file.name}": demasiado grande (max ${(MAX_IMAGEN_BYTES/1024/1024).toFixed(0)} MB).`);
        continue;
      }

      const insRow = await supabase
        .from("presupuesto_imagenes")
        .insert({
          empresa_id: empresaId,
          venta_id: ventaId,
          nombre: file.name,
          mime: file.type || null,
          size_bytes: file.size,
          storage_path: "pending",
          orden: nextOrden,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (insRow.error || !insRow.data) {
        errores.push(`"${file.name}": no se pudo registrar.`);
        continue;
      }
      const imagenId = (insRow.data as { id: string }).id;
      const path = buildImagenPath({ empresaId, ventaId, imagenId, mime: file.type });
      const buf = Buffer.from(await file.arrayBuffer());
      const up = await supabase.storage
        .from(PRESUPUESTO_IMAGENES_BUCKET)
        .upload(path, buf, { contentType: file.type, upsert: false });
      if (up.error) {
        await supabase.from("presupuesto_imagenes").delete().eq("id", imagenId).eq("empresa_id", empresaId);
        errores.push(`"${file.name}": fallo al subir (${up.error.message}).`);
        continue;
      }
      const upd = await supabase
        .from("presupuesto_imagenes")
        .update({ storage_path: path })
        .eq("id", imagenId)
        .eq("empresa_id", empresaId)
        .select("id, nombre, mime, size_bytes, orden, created_at")
        .maybeSingle();
      if (upd.error || !upd.data) {
        await supabase.storage.from(PRESUPUESTO_IMAGENES_BUCKET).remove([path]);
        await supabase.from("presupuesto_imagenes").delete().eq("id", imagenId).eq("empresa_id", empresaId);
        errores.push(`"${file.name}": no se pudo guardar la ruta.`);
        continue;
      }
      const signed = await signImagen(supabase, path, 3600);
      creados.push({ ...(upd.data as Record<string, unknown>), url: signed });
      nextOrden += 1;
    }

    return NextResponse.json(successResponse({ creados, errores }));
  } catch (err) {
    console.error("[ventas/imagenes POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron subir las imagenes."), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id: ventaId } = await ctxParams.params;
    const imagenId = request.nextUrl.searchParams.get("imagenId");
    if (!imagenId) return NextResponse.json(errorResponse("imagenId obligatorio"), { status: 400 });
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    const sel = await supabase
      .from("presupuesto_imagenes")
      .select("id, storage_path")
      .eq("id", imagenId)
      .eq("empresa_id", empresaId)
      .eq("venta_id", ventaId)
      .maybeSingle();
    if (sel.error) return NextResponse.json(errorResponse(sel.error.message), { status: 400 });
    if (!sel.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const row = sel.data as { id: string; storage_path: string };
    if (row.storage_path && pathBelongsToEmpresa(row.storage_path, empresaId)) {
      await supabase.storage.from(PRESUPUESTO_IMAGENES_BUCKET).remove([row.storage_path]);
    }
    await supabase.from("presupuesto_imagenes").delete().eq("id", imagenId).eq("empresa_id", empresaId);
    return NextResponse.json(successResponse({ deleted: imagenId }));
  } catch (err) {
    console.error("[ventas/imagenes DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo borrar la imagen."), { status: 500 });
  }
}
