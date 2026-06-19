import type { Venta, PagoDetalleVenta } from "./types";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type ResultadoGuardarVenta =
  | { success: true; venta: Venta }
  | { success: false; error: string };

/**
 * Pedido asociado a la venta (kanban).
 * - Gastronomía: modalidad obligatoria (local|delivery|carry_out) + mesa o datos delivery.
 * - Distribuidora / no-gastronomía: modalidad = null. Igual se crea el pedido
 *   en el kanban como tarjeta de seguimiento, con título genérico.
 */
export type PedidoCocinaInput = {
  modalidad: "local" | "delivery" | "carry_out" | null;
  mesa?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  observacion?: string | null;
};

/**
 * Lista ventas del tenant (misma fuente que el dashboard: tablas `ventas` / `ventas_items`).
 */
export async function getVentas(): Promise<Venta[]> {
  try {
    const res = await fetchWithSupabaseSession("/api/ventas", { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { ventas?: Venta[] };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.ventas) {
      console.error("[ventas] getVentas:", json.error ?? res.statusText);
      return [];
    }
    return json.data.ventas;
  } catch (e) {
    console.error("[ventas] getVentas:", e);
    return [];
  }
}

/**
 * Crea una venta en base de datos (transacción servidor: ítems, stock, movimientos).
 */
export async function saveVenta(
  datos: Omit<Venta, "id" | "numero_control" | "fecha">,
  pedidoCocina?: PedidoCocinaInput,
  pagoDetalle?: PagoDetalleVenta | null,
  opts?: { tipoDocumento?: "venta" | "presupuesto"; presupuestoMeta?: Record<string, unknown> | null; clienteId?: string | null }
): Promise<ResultadoGuardarVenta> {
  // Para presupuestos permitimos items vacíos (draft de cotización).
  // Para ventas reales seguimos exigiendo al menos un producto.
  const esPresupuesto = opts?.tipoDocumento === "presupuesto";
  if (!esPresupuesto && (!datos.items || datos.items.length === 0)) {
    return { success: false, error: "La venta debe tener al menos un producto." };
  }

  try {
    const res = await fetchWithSupabaseSession("/api/ventas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: datos.items,
        moneda: datos.moneda,
        tipo_cambio: datos.tipo_cambio,
        subtotal: datos.subtotal,
        monto_iva: datos.monto_iva,
        total: datos.total,
        tipo_venta: datos.tipo_venta,
        plazo_dias: datos.plazo_dias,
        metodo_pago: datos.metodo_pago,
        cliente_id: opts?.clienteId ?? null,
        observaciones: null,
        pedido_cocina: pedidoCocina ?? null,
        pago_detalle: pagoDetalle ?? null,
        tipo_documento: opts?.tipoDocumento ?? "venta",
        presupuesto_meta: opts?.presupuestoMeta ?? null,
      }),
    });

    const json = (await res.json()) as {
      success?: boolean;
      data?: { venta?: Venta };
      error?: string;
    };

    if (!res.ok || !json.success || !json.data?.venta) {
      return {
        success: false,
        error: json.error ?? `No se pudo registrar la venta (${res.status}).`,
      };
    }

    return { success: true, venta: json.data.venta };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red.";
    return { success: false, error: msg };
  }
}
