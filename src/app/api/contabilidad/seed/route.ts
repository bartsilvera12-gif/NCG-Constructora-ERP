import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { PLAN_CUENTAS_ES, CONFIG_DEFAULT_CODIGOS } from "@/lib/contabilidad/plan-cuentas-es";

/**
 * POST /api/contabilidad/seed
 *
 * Idempotente. Siembra el plan de cuentas ES base + config default con los
 * códigos apropiados. Si la empresa ya tiene cuentas cargadas, respeta lo
 * existente (upsert por codigo).
 */
export async function POST(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const empresaId = ctx.auth.empresa_id;

  // 1) Upsert de cuentas.
  const rowsCuentas = PLAN_CUENTAS_ES.map((c) => ({
    empresa_id: empresaId,
    codigo: c.codigo,
    nombre: c.nombre,
    tipo: c.tipo,
  }));
  const upC = await ctx.supabase
    .from("plan_cuentas")
    .upsert(rowsCuentas, { onConflict: "empresa_id,codigo" })
    .select("id, codigo");
  if (upC.error) return NextResponse.json(errorResponse(upC.error.message), { status: 500 });

  // 2) Map codigo → id.
  const map = new Map<string, string>();
  for (const r of upC.data ?? []) map.set((r as { codigo: string }).codigo, (r as { id: string }).id);

  // 3) Upsert de config con los ids resueltos.
  const configRow: Record<string, string | null> = { empresa_id: empresaId };
  for (const [k, codigo] of Object.entries(CONFIG_DEFAULT_CODIGOS)) {
    configRow[k] = map.get(codigo) ?? null;
  }
  const upCfg = await ctx.supabase
    .from("contable_config")
    .upsert(configRow, { onConflict: "empresa_id" })
    .select("empresa_id");
  if (upCfg.error) return NextResponse.json(errorResponse(upCfg.error.message), { status: 500 });

  return NextResponse.json(successResponse({ cuentas: upC.data?.length ?? 0 }));
}
