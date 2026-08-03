import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { asentarVenta, asentarCompra, asentarGasto } from "@/lib/contabilidad/asientos";

/**
 * Server-side helper: dispara el asentador correspondiente sin bloquear (no
 * await). Los errores se loguean en console; el caller no se entera. Se usa
 * en handlers de POST de venta/compra/gasto justo después del insert exitoso.
 */
export function asentarBackgroundServer(
  sb: AppSupabaseClient,
  empresaId: string,
  tipo: "venta" | "compra" | "gasto",
  id: string
): void {
  const p =
    tipo === "venta"  ? asentarVenta(sb, empresaId, id)  :
    tipo === "compra" ? asentarCompra(sb, empresaId, id) :
                        asentarGasto(sb, empresaId, id);
  void p
    .then((res) => {
      if (!res.ok) console.warn(`[asentar ${tipo} ${id}] ${res.error}`);
    })
    .catch((e) => console.warn(`[asentar ${tipo} ${id}] exception`, e));
}
