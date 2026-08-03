import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Dispara la generación del asiento contable de un movimiento (venta, compra
 * o gasto) sin bloquear al caller. Si falla, solo loguea a consola — el
 * backfill puede correrse después manualmente desde /configuracion/contable.
 */
export function asentarBackground(tipo: "venta" | "compra" | "gasto", id: string): void {
  void fetchWithSupabaseSession(`/api/contabilidad/asentar?tipo=${tipo}&id=${encodeURIComponent(id)}`, {
    method: "POST",
  })
    .then(async (r) => {
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        console.warn(`[asentar ${tipo} ${id}] ${j.error ?? r.status}`);
      }
    })
    .catch((e) => console.warn(`[asentar ${tipo} ${id}] fetch error`, e));
}
