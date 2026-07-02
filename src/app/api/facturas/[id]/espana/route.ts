import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * PATCH /api/facturas/[id]/espana — actualiza los campos fiscales España de
 * una factura (Fase J). Sólo toca las columnas nuevas, no interfiere con el
 * flujo SIFEN Paraguay. Todos los campos son opcionales.
 *
 * Body:
 * {
 *   cif_nif_receptor?, nombre_receptor?,
 *   base_imponible?, iva_pct?, iva_importe?,
 *   retencion_pct?, retencion_importe?, total_espana?,
 *   proyecto_id_ncg?, tipo_operacion?, estado_fiscal?
 * }
 */

const TIPO_OPS = ["nacional","intracomunitaria","exportacion"] as const;
const ESTADOS_FISCAL = ["pendiente","informada","validada","rechazada"] as const;

const numn = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Texto libre
    for (const k of ["cif_nif_receptor","nombre_receptor"]) {
      if (body[k] !== undefined) update[k] = body[k] ? String(body[k]).trim() || null : null;
    }
    // Numéricos
    for (const k of ["base_imponible","iva_pct","iva_importe","retencion_pct","retencion_importe","total_espana"]) {
      if (body[k] !== undefined) update[k] = numn(body[k]);
    }
    // Proyecto
    if (body.proyecto_id_ncg !== undefined) update.proyecto_id_ncg = body.proyecto_id_ncg ? String(body.proyecto_id_ncg) : null;
    // Enums
    if (body.tipo_operacion !== undefined) {
      const t = body.tipo_operacion ? String(body.tipo_operacion) : null;
      if (t && !TIPO_OPS.includes(t as typeof TIPO_OPS[number])) return NextResponse.json(errorResponse("tipo_operacion inválido"), { status: 400 });
      update.tipo_operacion = t;
    }
    if (body.estado_fiscal !== undefined) {
      const e = body.estado_fiscal ? String(body.estado_fiscal) : null;
      if (e && !ESTADOS_FISCAL.includes(e as typeof ESTADOS_FISCAL[number])) return NextResponse.json(errorResponse("estado_fiscal inválido"), { status: 400 });
      update.estado_fiscal = e;
    }

    // Autocálculo suave si vienen base + iva_pct pero no importes explícitos
    if (update.base_imponible !== undefined && update.iva_pct !== undefined && update.iva_importe === undefined) {
      const base = Number(update.base_imponible) || 0;
      const pct = Number(update.iva_pct) || 0;
      update.iva_importe = Number((base * pct / 100).toFixed(2));
    }

    const { error } = await ctx.supabase
      .from("facturas")
      .update(update)
      .eq("id", id)
      .eq("empresa_id", ctx.auth.empresa_id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
