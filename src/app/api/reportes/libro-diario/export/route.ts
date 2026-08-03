import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchLibroDiario } from "@/lib/contabilidad/libros-data";
import { buildXlsx, xlsxResponse, slugFecha } from "@/lib/contabilidad/export-xlsx";

export const runtime = "nodejs";

/**
 * Cada línea del asiento va en una fila del XLSX; el nº y fecha del asiento
 * se repiten en cada línea para que se pueda filtrar y sumar en Excel.
 */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("No autorizado", { status: 401 });
  const sp = new URL(request.url).searchParams;
  const desde = sp.get("desde"); const hasta = sp.get("hasta");
  try {
    const { asientos } = await fetchLibroDiario(ctx.supabase, ctx.auth.empresa_id, { desde, hasta });
    const excelRows: Array<Record<string, unknown>> = [];
    for (const a of asientos) {
      for (const l of a.lineas) {
        excelRows.push({
          "Nº asiento": a.numero, Fecha: a.fecha, Concepto: a.concepto,
          Origen: a.origen_tipo ?? "",
          "Cuenta": l.cuenta_codigo, "Nombre cuenta": l.cuenta_nombre,
          Descripción: l.descripcion ?? "",
          Debe: l.debe, Haber: l.haber,
        });
      }
    }
    return xlsxResponse(buildXlsx("Libro Diario", excelRows), `libro-diario${slugFecha(desde, hasta)}.xlsx`);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Error", { status: 500 });
  }
}
