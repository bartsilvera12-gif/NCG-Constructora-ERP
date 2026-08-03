import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/libro-mayor?desde=&hasta=&cuenta_id=<opcional>
 *
 * Movimientos y saldo acumulado por cuenta. Si se pasa `cuenta_id`, muestra
 * solo esa cuenta con detalle de cada movimiento. Sin `cuenta_id`, devuelve
 * el resumen de saldos por cuenta.
 */

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const sp = new URL(request.url).searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  const cuentaId = sp.get("cuenta_id");

  // Saldo inicial (todo lo anterior a `desde`).
  const empresaId = ctx.auth.empresa_id;

  // Base query de líneas dentro del rango.
  let lineasQ = ctx.supabase
    .from("asientos_lineas")
    .select("id, debe, haber, descripcion, cuenta_id, asiento:asientos_contables!inner(id, numero, fecha, concepto, anulado)")
    .eq("empresa_id", empresaId)
    .eq("asiento.anulado", false);
  if (isDate(desde)) lineasQ = lineasQ.gte("asiento.fecha", desde);
  if (isDate(hasta)) lineasQ = lineasQ.lte("asiento.fecha", hasta);
  if (cuentaId) lineasQ = lineasQ.eq("cuenta_id", cuentaId);
  const { data: lineasData, error: lineasErr } = await lineasQ;
  if (lineasErr) return NextResponse.json(errorResponse(lineasErr.message), { status: 500 });

  // Saldos iniciales (líneas anteriores a `desde`).
  const saldoInicialMap = new Map<string, { debe: number; haber: number }>();
  if (isDate(desde)) {
    let iniQ = ctx.supabase
      .from("asientos_lineas")
      .select("cuenta_id, debe, haber, asiento:asientos_contables!inner(fecha, anulado)")
      .eq("empresa_id", empresaId)
      .eq("asiento.anulado", false)
      .lt("asiento.fecha", desde);
    if (cuentaId) iniQ = iniQ.eq("cuenta_id", cuentaId);
    const { data: iniData } = await iniQ;
    for (const l of (iniData ?? []) as Array<{ cuenta_id: string; debe: number; haber: number }>) {
      const cur = saldoInicialMap.get(l.cuenta_id) ?? { debe: 0, haber: 0 };
      cur.debe += Number(l.debe);
      cur.haber += Number(l.haber);
      saldoInicialMap.set(l.cuenta_id, cur);
    }
  }

  // Cuentas involucradas.
  const cuentaIds = new Set<string>();
  for (const l of (lineasData ?? []) as Array<{ cuenta_id: string }>) cuentaIds.add(l.cuenta_id);
  for (const k of saldoInicialMap.keys()) cuentaIds.add(k);

  const cuentasQ = await ctx.supabase
    .from("plan_cuentas")
    .select("id, codigo, nombre, tipo")
    .eq("empresa_id", empresaId)
    .in("id", Array.from(cuentaIds));
  const cuentaMap = new Map<string, { codigo: string; nombre: string; tipo: string }>();
  for (const c of (cuentasQ.data ?? []) as Array<{ id: string; codigo: string; nombre: string; tipo: string }>) {
    cuentaMap.set(c.id, { codigo: c.codigo, nombre: c.nombre, tipo: c.tipo });
  }

  // Si vino cuenta_id → detalle línea a línea con saldo acumulado.
  if (cuentaId) {
    const ordenadas = ((lineasData ?? []) as Array<Record<string, unknown>>).map((l) => {
      const a = l.asiento as { numero?: string; fecha?: string; concepto?: string } | { numero?: string; fecha?: string; concepto?: string }[] | null;
      const aa = Array.isArray(a) ? a[0] : a;
      return {
        fecha: String(aa?.fecha ?? ""),
        numero: String(aa?.numero ?? ""),
        concepto: String(aa?.concepto ?? ""),
        descripcion: (l.descripcion as string | null) ?? null,
        debe: Number(l.debe ?? 0),
        haber: Number(l.haber ?? 0),
      };
    }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero));
    const ini = saldoInicialMap.get(cuentaId) ?? { debe: 0, haber: 0 };
    let saldo = ini.debe - ini.haber;
    const movimientos = ordenadas.map((m) => {
      saldo += m.debe - m.haber;
      return { ...m, saldo };
    });
    const cuenta = cuentaMap.get(cuentaId) ?? { codigo: "?", nombre: "?", tipo: "" };
    return NextResponse.json(successResponse({
      modo: "detalle" as const,
      cuenta: { id: cuentaId, ...cuenta },
      saldo_inicial: ini.debe - ini.haber,
      movimientos,
      saldo_final: saldo,
    }));
  }

  // Sin cuenta_id → resumen por cuenta.
  const resumen = new Map<string, { debe: number; haber: number }>();
  for (const [k, v] of saldoInicialMap) {
    resumen.set(k, { debe: v.debe, haber: v.haber });
  }
  for (const l of (lineasData ?? []) as Array<{ cuenta_id: string; debe: number; haber: number }>) {
    const cur = resumen.get(l.cuenta_id) ?? { debe: 0, haber: 0 };
    cur.debe += Number(l.debe);
    cur.haber += Number(l.haber);
    resumen.set(l.cuenta_id, cur);
  }
  const cuentas = Array.from(resumen.entries()).map(([id, v]) => {
    const meta = cuentaMap.get(id) ?? { codigo: "?", nombre: "?", tipo: "" };
    const ini = saldoInicialMap.get(id) ?? { debe: 0, haber: 0 };
    return {
      cuenta_id: id,
      codigo: meta.codigo,
      nombre: meta.nombre,
      tipo: meta.tipo,
      saldo_inicial: ini.debe - ini.haber,
      debe_periodo: v.debe - ini.debe,
      haber_periodo: v.haber - ini.haber,
      saldo_final: v.debe - v.haber,
    };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo));

  return NextResponse.json(successResponse({ modo: "resumen" as const, cuentas }));
}
