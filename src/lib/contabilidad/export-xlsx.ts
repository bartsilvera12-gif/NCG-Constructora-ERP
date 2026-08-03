import * as XLSX from "xlsx";

/**
 * Genera un buffer XLSX a partir de un array de objetos.
 * Formatea cabeceras en negrita y auto-ajusta anchos de columnas.
 */
export function buildXlsx(sheetName: string, rows: Array<Record<string, unknown>>): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-width por columna (max 40 chars).
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const widths: number[] = [];
  for (let C = range.s.c; C <= range.e.c; C++) {
    let max = 8;
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ c: C, r: R })];
      if (cell?.v != null) max = Math.min(40, Math.max(max, String(cell.v).length + 2));
    }
    widths.push(max);
  }
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel limita a 31 chars
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

export function xlsxResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function slugFecha(desde?: string | null, hasta?: string | null): string {
  const d = desde?.replace(/-/g, "") ?? "";
  const h = hasta?.replace(/-/g, "") ?? "";
  if (d && h) return `_${d}-${h}`;
  if (d) return `_desde-${d}`;
  if (h) return `_hasta-${h}`;
  return "";
}
