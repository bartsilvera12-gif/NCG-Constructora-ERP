import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchLibroCompras } from "@/lib/contabilidad/libros-data";
import { buildXlsx, xlsxResponse, slugFecha } from "@/lib/contabilidad/export-xlsx";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("No autorizado", { status: 401 });
  const sp = new URL(request.url).searchParams;
  const desde = sp.get("desde"); const hasta = sp.get("hasta"); const origen = sp.get("origen");
  try {
    const { rows, totals } = await fetchLibroCompras(ctx.supabase, ctx.auth.empresa_id, { desde, hasta, origen });
    const excelRows: Array<Record<string, unknown>> = rows.map((r) => ({
      Fecha: r.fecha, Origen: r.origen,
      "Nº / Descripción": r.numero,
      Proveedor: r.proveedor_nombre, NIF: r.proveedor_nif ?? "",
      "Base 4%": r.base_iva_4, "Base 10%": r.base_iva_10, "Base 21%": r.base_iva_21, Exento: r.base_exento,
      "IVA 4%": r.iva_4, "IVA 10%": r.iva_10, "IVA 21%": r.iva_21, Total: r.total,
    }));
    excelRows.push({
      Fecha: "", Origen: "", "Nº / Descripción": "", Proveedor: "TOTALES", NIF: "",
      "Base 4%": totals.base_iva_4, "Base 10%": totals.base_iva_10, "Base 21%": totals.base_iva_21, Exento: totals.base_exento,
      "IVA 4%": totals.iva_4, "IVA 10%": totals.iva_10, "IVA 21%": totals.iva_21, Total: totals.total,
    });
    return xlsxResponse(buildXlsx("Libro de Compras", excelRows), `libro-compras${slugFecha(desde, hasta)}.xlsx`);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Error", { status: 500 });
  }
}
