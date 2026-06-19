import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Row = {
  empresa_id: string;
  nombre: string | null;
  direccion: string | null;
  cp_ciudad: string | null;
  provincia: string | null;
  nif: string | null;
  telefono: string | null;
  email: string | null;
  updated_at?: string | null;
};

const EMPTY: Omit<Row, "empresa_id"> = {
  nombre: null, direccion: null, cp_ciudad: null, provincia: null,
  nif: null, telefono: null, email: null,
};

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const { data, error } = await ctx.supabase
    .from("presupuesto_emisor_config")
    .select("empresa_id, nombre, direccion, cp_ciudad, provincia, nif, telefono, email, updated_at")
    .eq("empresa_id", ctx.auth.empresa_id)
    .maybeSingle();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse({ emisor: data ?? { empresa_id: ctx.auth.empresa_id, ...EMPTY } }));
}

export async function PUT(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const row: Row = {
    empresa_id: ctx.auth.empresa_id,
    nombre:    clean(body.nombre),
    direccion: clean(body.direccion),
    cp_ciudad: clean(body.cp_ciudad),
    provincia: clean(body.provincia),
    nif:       clean(body.nif),
    telefono:  clean(body.telefono),
    email:     clean(body.email),
  };
  const { data, error } = await ctx.supabase
    .from("presupuesto_emisor_config")
    .upsert({ ...row, updated_at: new Date().toISOString(), updated_by: ctx.auth.usuarioCatalogId ?? null }, { onConflict: "empresa_id" })
    .select("empresa_id, nombre, direccion, cp_ciudad, provincia, nif, telefono, email, updated_at")
    .single();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse({ emisor: data }));
}
