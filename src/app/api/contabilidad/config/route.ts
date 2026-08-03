import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const CAMPOS_CONFIG = [
  "cuenta_clientes", "cuenta_proveedores", "cuenta_ventas", "cuenta_compras", "cuenta_gastos",
  "cuenta_iva_repercutido_4", "cuenta_iva_repercutido_10", "cuenta_iva_repercutido_21",
  "cuenta_iva_soportado_4", "cuenta_iva_soportado_10", "cuenta_iva_soportado_21",
  "cuenta_irpf", "cuenta_caja", "cuenta_banco",
] as const;

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const { data, error } = await ctx.supabase
    .from("contable_config")
    .select(CAMPOS_CONFIG.join(", "))
    .eq("empresa_id", ctx.auth.empresa_id)
    .maybeSingle();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse({ config: data ?? {} }));
}

export async function PUT(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const row: Record<string, unknown> = { empresa_id: ctx.auth.empresa_id, updated_at: new Date().toISOString(), updated_by: ctx.auth.usuarioCatalogId ?? null };
  for (const campo of CAMPOS_CONFIG) {
    if (Object.prototype.hasOwnProperty.call(body, campo)) {
      const v = body[campo];
      row[campo] = typeof v === "string" && v ? v : null;
    }
  }
  const { data, error } = await ctx.supabase
    .from("contable_config")
    .upsert(row, { onConflict: "empresa_id" })
    .select(CAMPOS_CONFIG.join(", "))
    .single();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse({ config: data }));
}
