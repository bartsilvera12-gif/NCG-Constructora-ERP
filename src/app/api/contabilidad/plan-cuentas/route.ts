import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const TIPOS = ["activo", "pasivo", "patrimonio", "ingreso", "gasto", "orden"] as const;

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const { data, error } = await ctx.supabase
    .from("plan_cuentas")
    .select("id, codigo, nombre, tipo, activo")
    .eq("empresa_id", ctx.auth.empresa_id)
    .order("codigo", { ascending: true });
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse({ cuentas: data ?? [] }));
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const tipo = TIPOS.includes(body.tipo as (typeof TIPOS)[number]) ? (body.tipo as string) : null;
  if (!codigo || !nombre || !tipo) return NextResponse.json(errorResponse("codigo, nombre y tipo son requeridos"), { status: 400 });
  const { data, error } = await ctx.supabase
    .from("plan_cuentas")
    .upsert({ empresa_id: ctx.auth.empresa_id, codigo, nombre, tipo, activo: true }, { onConflict: "empresa_id,codigo" })
    .select("id, codigo, nombre, tipo, activo")
    .single();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse({ cuenta: data }));
}

export async function PATCH(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json(errorResponse("id requerido"), { status: 400 });
  const update: Record<string, unknown> = {};
  if (typeof body.nombre === "string" && body.nombre.trim()) update.nombre = body.nombre.trim();
  if (typeof body.tipo === "string" && TIPOS.includes(body.tipo as (typeof TIPOS)[number])) update.tipo = body.tipo;
  if (typeof body.activo === "boolean") update.activo = body.activo;
  if (Object.keys(update).length === 0) return NextResponse.json(errorResponse("nada para actualizar"), { status: 400 });
  const { data, error } = await ctx.supabase
    .from("plan_cuentas")
    .update(update)
    .eq("id", id)
    .eq("empresa_id", ctx.auth.empresa_id)
    .select("id, codigo, nombre, tipo, activo")
    .single();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse({ cuenta: data }));
}

export async function DELETE(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json(errorResponse("id requerido"), { status: 400 });
  const { error } = await ctx.supabase
    .from("plan_cuentas")
    .delete()
    .eq("id", id)
    .eq("empresa_id", ctx.auth.empresa_id);
  if (error) return NextResponse.json(errorResponse(`No se pudo eliminar (¿en uso por asientos o mapeo?): ${error.message}`), { status: 500 });
  return NextResponse.json(successResponse({ id }));
}
