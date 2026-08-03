import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { buildXlsx, xlsxResponse, slugFecha } from "@/lib/contabilidad/export-xlsx";

export const runtime = "nodejs";

/**
 * Reusa el endpoint de listado del libro-mayor via una llamada interna
 * (misma request context). Simple porque el mayor tiene 2 modos.
 */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("No autorizado", { status: 401 });
  const url = new URL(request.url);
  const desde = url.searchParams.get("desde"); const hasta = url.searchParams.get("hasta");
  const cuentaId = url.searchParams.get("cuenta_id");

  try {
    // Llamamos al listado JSON existente vía fetch interno pasando cookies+auth.
    const listUrl = new URL(`/api/reportes/libro-mayor?${url.searchParams.toString()}`, request.url);
    const listRes = await fetch(listUrl, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        authorization: request.headers.get("authorization") ?? "",
      },
    });
    const j = await listRes.json();
    if (!j.success) return new Response(j.error ?? "Error", { status: 500 });

    const excelRows: Array<Record<string, unknown>> = [];
    if (j.data?.modo === "detalle") {
      const m = j.data.movimientos as Array<{ fecha: string; numero: string; concepto: string; descripcion: string | null; debe: number; haber: number; saldo: number }>;
      for (const r of m) {
        excelRows.push({
          Fecha: r.fecha, "Nº asiento": r.numero, Concepto: r.concepto,
          Descripción: r.descripcion ?? "",
          Debe: r.debe, Haber: r.haber, Saldo: r.saldo,
        });
      }
    } else {
      const c = j.data?.cuentas as Array<{ codigo: string; nombre: string; tipo: string; saldo_inicial: number; debe_periodo: number; haber_periodo: number; saldo_final: number }>;
      for (const r of c) {
        excelRows.push({
          Código: r.codigo, Nombre: r.nombre, Tipo: r.tipo,
          "Saldo inicial": r.saldo_inicial,
          Debe: r.debe_periodo, Haber: r.haber_periodo,
          "Saldo final": r.saldo_final,
        });
      }
    }

    const suffix = cuentaId ? `_cuenta-${cuentaId.slice(0, 8)}` : "";
    return xlsxResponse(buildXlsx("Libro Mayor", excelRows), `libro-mayor${slugFecha(desde, hasta)}${suffix}.xlsx`);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Error", { status: 500 });
  }
}
