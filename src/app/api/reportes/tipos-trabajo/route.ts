import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
/**
 * GET /api/reportes/tipos-trabajo?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Agrupa las ventas (presupuestos + ventas reales con presupuesto_meta)
 * por tipo_obra_id (catálogo proyecto_tipos) y devuelve:
 *   - presupuestos: # tipo_documento='presupuesto'
 *   - ventas:       # tipo_documento='venta'
 *   - total:        suma de venta.total de los registros del tipo
 *   - convertidos:  # presupuestos en estado 'aprobado' o 'convertido'
 */

interface VentaLite {
  total: number | string | null;
  tipo_documento: string | null;
  estado_presupuesto: string | null;
  presupuesto_meta: Record<string, unknown> | null;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function metaTipoObraId(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const v = meta.tipo_obra_id;
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const url = new URL(request.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");

    let q = ctx.supabase
      .from("ventas")
      .select("total, tipo_documento, estado_presupuesto, presupuesto_meta")
      .eq("empresa_id", empresaId)
      .not("presupuesto_meta", "is", null);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    const rows = (data ?? []) as VentaLite[];

    // Catálogo de tipos para resolver el nombre.
    const { data: tipos } = await ctx.supabase
      .from("proyecto_tipos")
      .select("id, nombre")
      .eq("empresa_id", empresaId);
    const tipoNombre = new Map<string, string>(
      ((tipos ?? []) as Array<{ id: string; nombre: string }>).map((t) => [t.id, t.nombre])
    );

    type Bucket = {
      tipo: string;
      label: string;
      presupuestos: number;
      ventas: number;
      convertidos: number;
      total: number;
    };
    const SIN = "__sin__";
    const map = new Map<string, Bucket>();
    for (const r of rows) {
      const tipoId = metaTipoObraId(r.presupuesto_meta);
      const key = tipoId ?? SIN;
      let b = map.get(key);
      if (!b) {
        b = {
          tipo: key,
          label: tipoId ? (tipoNombre.get(tipoId) ?? "Tipo desconocido") : "Sin clasificar",
          presupuestos: 0,
          ventas: 0,
          convertidos: 0,
          total: 0,
        };
        map.set(key, b);
      }
      const total = num(r.total);
      b.total += total;
      if (r.tipo_documento === "presupuesto") {
        b.presupuestos += 1;
        if (r.estado_presupuesto === "aprobado" || r.estado_presupuesto === "convertido") {
          b.convertidos += 1;
        }
      } else {
        b.ventas += 1;
      }
    }

    const items = [...map.values()].sort((a, b) => {
      const ca = a.presupuestos + a.ventas;
      const cb = b.presupuestos + b.ventas;
      if (cb !== ca) return cb - ca;
      return b.total - a.total;
    });

    const resumen = {
      total_registros: rows.length,
      total_facturado: items.reduce((s, b) => s + b.total, 0),
      tipos_distintos: items.length,
    };

    return NextResponse.json(successResponse({ items, resumen, desde, hasta }));
  } catch (err) {
    console.error("[/api/reportes/tipos-trabajo]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo generar el reporte."), { status: 500 });
  }
}
