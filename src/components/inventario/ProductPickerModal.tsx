"use client";

import { useEffect, useRef, useState } from "react";
import type { TipoIvaVenta } from "@/lib/ventas/types";
import { parseImporte, importeToInputValue } from "@/lib/utils/money";

export interface ProductoPickerItem {
  id: string;
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  precio_venta: number;
  precio_minorista: number;
  precio_mayorista: number;
  costo_promedio: number;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string;
  metodo_valuacion: string;
  imagen_url: string | null;
  imagen_path: string | null;
  categoria_nombre: string | null;
  proveedor_nombre: string | null;
  ubicacion_nombre: string | null;
  ubicacion_tipo: string | null;
  /** Si false → producto preparado (Menú): no valida stock ni muestra "Sin stock". */
  controla_stock?: boolean;
}

/**
 * Resultado emitido al hacer clic en "Agregar a la venta": el caller
 * recibe el producto, la cantidad, el precio (en la moneda de la venta)
 * y el tipo de IVA. El precio se interpreta en la moneda activa de la
 * venta, y el caller hace la conversion a PYG si corresponde.
 */
export interface AgregarVentaPayload {
  producto: ProductoPickerItem;
  cantidad: number;
  precio_input: number;
  iva: TipoIvaVenta;
  /** Tipo de precio elegido en el panel de detalle (minorista/mayorista/al costo). */
  tipo_precio: "minorista" | "mayorista" | "costo";
  /** Si true, el `precio_input` ya incluye IVA y se debe extraer. */
  precio_incluye_iva: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback que agrega el producto a la venta. Si retorna `false`, el modal
   *  conserva la seleccion (ej. error de stock); si retorna `true`, limpia
   *  la cantidad para seguir cargando. */
  onAgregar: (p: AgregarVentaPayload) => boolean | void;
  excludeIds?: string[];
  /** Moneda actual de la venta. */
  moneda?: "GS" | "USD";
  /** Tipo de cambio cuando moneda=USD (PYG por USD). 0 si no se cargo. */
  tipoCambio?: number;
  /** IVA default que viene de la venta. */
  ivaDefault?: TipoIvaVenta;
  /** Tasas disponibles a mostrar en el selector (orden importa). */
  tasasIva?: TipoIvaVenta[];
  /**
   * Modo de uso del picker:
   *  - "venta" (default): labels "Precio venta", "Total a cobrar",
   *    "Agregar a la venta", tipo de precio minorista/mayorista/al costo.
   *  - "presupuesto": labels de cotización. Oculta el selector de tipo de
   *    precio (en obra se cotiza precio puntual, no minorista/mayorista),
   *    cambia los textos del resumen al lenguaje de presupuesto.
   */
  mode?: "venta" | "presupuesto";
}

function formatGs(v: number): string {
  return `€ ${v.toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Precio unitario (en PYG) según el tipo de precio elegido, con fallbacks:
 *  minorista → precio_minorista (fallback precio_venta);
 *  mayorista → precio_mayorista (fallback minorista);
 *  costo     → costo_promedio.
 */
function precioPorTipoPicker(
  p: ProductoPickerItem,
  tipo: "minorista" | "mayorista" | "costo"
): number {
  const minorista = p.precio_minorista != null && p.precio_minorista > 0 ? p.precio_minorista : p.precio_venta;
  if (tipo === "mayorista") return p.precio_mayorista != null && p.precio_mayorista > 0 ? p.precio_mayorista : minorista;
  if (tipo === "costo") return p.costo_promedio ?? 0;
  return minorista;
}

export default function ProductPickerModal({
  open, onClose, onAgregar, excludeIds = [], moneda = "GS", tipoCambio = 1,
  ivaDefault = "21%",
  tasasIva = ["EXENTA", "4%", "10%", "21%"],
  mode = "venta",
}: Props) {
  const esPresupuesto = mode === "presupuesto";
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductoPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Panel detalle
  const [sel, setSel] = useState<ProductoPickerItem | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");
  const [iva, setIva] = useState<TipoIvaVenta>(ivaDefault);
  // Todos los precios del catálogo incluyen IVA. El total NO suma IVA encima:
  // se extrae la base imponible desde el bruto para mostrar el desglose.
  const precioIncluyeIva = true;
  const [tipoPrecio, setTipoPrecio] = useState<"minorista" | "mayorista" | "costo">("minorista");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => { if (open) { setQ(""); setError(null); setSel(null); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Buscar (debounce 200ms)
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const url = new URL("/api/productos/search", window.location.origin);
        if (q.trim().length >= 2) url.searchParams.set("q", q.trim());
        url.searchParams.set("limit", "50");
        const res = await fetch(url.toString(), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          setError(json?.error ?? "Error al buscar productos");
          setItems([]);
        } else {
          setItems((json.data?.items ?? []) as ProductoPickerItem[]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de red");
        setItems([]);
      } finally { setLoading(false); }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, open]);

  /**
   * Convierte el precio del producto (en la moneda base, sea € o GS) al texto que va
   * dentro del <input>. CONSERVA decimales: el bug anterior era hacer Math.round y
   * truncar 4,25 → 4.
   */
  function precioEnMonedaStr(precioBase: number): string {
    if (moneda === "USD" && tipoCambio > 0) {
      return importeToInputValue(precioBase / tipoCambio);
    }
    return importeToInputValue(precioBase);
  }

  function selectProducto(p: ProductoPickerItem) {
    setSel(p);
    setCantidad("1");
    // Precio inicial: minorista (en la moneda de la venta).
    setTipoPrecio("minorista");
    setPrecio(precioEnMonedaStr(precioPorTipoPicker(p, "minorista")));
    setIva(ivaDefault);
    setFeedback(null);
  }

  /** Cambia el tipo de precio del producto seleccionado y ajusta el precio unitario. */
  function handleTipoPrecio(tipo: "minorista" | "mayorista" | "costo") {
    setTipoPrecio(tipo);
    if (sel) setPrecio(precioEnMonedaStr(precioPorTipoPicker(sel, tipo)));
    setFeedback(null);
  }

  function handleAgregar() {
    if (!sel) return;
    const cantNum = parseImporte(cantidad);
    const precioNum = parseImporte(precio);
    if (cantNum <= 0) { setFeedback("Cantidad debe ser > 0"); return; }
    if (precioNum <= 0) { setFeedback("Precio debe ser > 0"); return; }
    if (moneda === "USD" && tipoCambio <= 0) { setFeedback(esPresupuesto ? "Falta tipo de cambio en el presupuesto" : "Falta tipo de cambio en la venta"); return; }
    // Solo validar stock si el producto controla stock (Reventa).
    // Productos del Menú (controla_stock=false) se agregan sin restricción.
    const ctrlStock = sel.controla_stock !== false;
    if (ctrlStock) {
      const enCarrito = excludeIds.filter((id) => id === sel.id).length;
      const disp = sel.stock_actual - enCarrito;
      if (cantNum > disp) {
        setFeedback(`Stock insuficiente (disponible ${disp})`);
        return;
      }
    }
    const ok = onAgregar({ producto: sel, cantidad: cantNum, precio_input: precioNum, iva, tipo_precio: tipoPrecio, precio_incluye_iva: precioIncluyeIva });
    if (ok !== false) {
      setFeedback(esPresupuesto ? "Partida agregada ✓" : "Producto agregado ✓");
      setCantidad("1");
      // foco al buscador para seguir cargando
      setTimeout(() => inputRef.current?.focus(), 0);
      setTimeout(() => setFeedback(null), 1500);
    }
  }

  if (!open) return null;
  const enCarritoSel = sel ? excludeIds.filter((id) => id === sel.id).length : 0;
  const dispSel = sel ? sel.stock_actual - enCarritoSel : 0;
  const precioGsEquiv = moneda === "USD" ? parseImporte(precio) * (tipoCambio || 0) : parseImporte(precio);
  const brutoLinea = parseImporte(cantidad) * precioGsEquiv;
  const tasaIva =
    iva === "21%" ? 0.21 :
    iva === "10%" ? 0.10 :
    iva === "5%"  ? 0.05 :
    iva === "4%"  ? 0.04 : 0;
  // Si el precio ingresado YA incluye IVA, se extrae del bruto. Si no, se suma encima.
  const baseImponible = tasaIva > 0 && precioIncluyeIva ? brutoLinea / (1 + tasaIva) : brutoLinea;
  const ivaMonto = tasaIva > 0
    ? (precioIncluyeIva ? brutoLinea - baseImponible : baseImponible * tasaIva)
    : 0;
  const totalLinea = baseImponible + ivaMonto;

  // Mobile: pt-3 (gana viewport vertical valioso, evita el modal "cortado")
  // y pt-12 en sm+ donde si hay espacio para el aire decorativo.
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm pt-3 sm:pt-12 px-2 sm:px-4" onClick={onClose}>
      {/* dvh (dynamic viewport height) en lugar de vh: en iOS Safari el vh
          incluye el espacio del URL bar/safe-area y el modal queda parcialmente
          oculto debajo del browser chrome. dvh devuelve el viewport REAL visible. */}
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[94dvh] sm:max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header con buscador */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 shrink-0">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, SKU, código, categoría o ubicación..."
              className="flex-1 bg-transparent outline-none text-base text-slate-800 placeholder:text-slate-400"
              autoComplete="off"
            />
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700" title="Cerrar (Esc)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Tokens en cualquier orden. Mínimo 2 letras por palabra. Esc para cerrar.
          </p>
        </div>

        {/* Body: lista + panel detalle.
            MASTER/DETAIL responsive:
              MOBILE (< lg): lista full-width cuando NO hay seleccion; cuando seleccionas
                             un producto, se oculta y aparece el panel detalle full-width
                             (con boton "Volver" para cerrar la seleccion).
              DESKTOP (>= lg): ambos lado a lado (60% / 40%).
            Antes el panel detalle era "hidden lg:flex" -> en mobile NO se veia el form
            para agregar el producto a la venta, por eso el usuario no podia cargar. */}
        <div className="flex flex-1 overflow-hidden">
          {/* LISTA */}
          <div className={`${sel ? "hidden lg:block" : "block"} w-full lg:w-3/5 lg:border-r border-slate-200 overflow-y-auto`}>
            {loading && <div className="p-6 text-center text-sm text-slate-400">Buscando...</div>}
            {!loading && error && <div className="m-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
            {!loading && !error && items.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-400">
                {q.trim().length >= 2 ? `Sin resultados para "${q}"` : "Escribí para buscar productos"}
              </div>
            )}
            {!loading && !error && items.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {items.map((p) => {
                  const enCarro = excludeIds.filter((id) => id === p.id).length;
                  const disp = p.stock_actual - enCarro;
                  // Productos del Menú (controla_stock=false) no aplican validación de stock.
                  const ctrlStock = p.controla_stock !== false;
                  const sinStock = ctrlStock && disp <= 0;
                  const isMenu = !ctrlStock;
                  const isSel = sel?.id === p.id;
                  return (
                    <li
                      key={p.id}
                      onClick={() => { if (!sinStock) selectProducto(p); }}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        sinStock ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                      } ${isSel ? "bg-sky-50" : "hover:bg-slate-50"}`}
                    >
                      <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                        {p.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-slate-300">
                            <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0L2.5 11.06ZM12 6.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 truncate">{p.nombre}</div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
                          <span className="font-mono">{p.sku}</span>
                          {p.codigo_barras && <span className="font-mono">· {p.codigo_barras}</span>}
                          {p.categoria_nombre && <span>· {p.categoria_nombre}</span>}
                          {p.ubicacion_nombre && <span>· {p.ubicacion_nombre}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-slate-800 tabular-nums">{formatGs(p.precio_venta)}</div>
                        {isMenu ? (
                          <div className="text-xs">
                            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 font-medium px-2 py-0.5">Menú</span>
                          </div>
                        ) : (
                          <div className={`text-xs tabular-nums ${sinStock ? "text-red-500" : "text-slate-500"}`}>
                            {sinStock ? "Sin stock" : `${disp} ${p.unidad_medida}`}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* PANEL DETALLE
              Layout flex column:
                - Header sticky: boton Volver (mobile only).
                - Middle scrollable: imagen + info + form inputs.
                - Footer sticky: boton "+ Agregar a la venta" SIEMPRE visible.
              Antes el boton estaba al final del scroll => en mobile chico el user
              no llegaba a verlo, no podia confirmar el producto. */}
          <div className={`${sel ? "flex" : "hidden lg:flex"} w-full lg:w-2/5 flex-col bg-slate-50 min-h-0`}>
            {!sel ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-6 text-center">
                Seleccioná un producto de la lista para {esPresupuesto ? "ver detalle y agregar al presupuesto" : "ver detalle y agregar a la venta"}.
              </div>
            ) : (
              <>
                {/* Mobile back button — sticky en el tope del panel */}
                <div className="lg:hidden shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setSel(null)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 transition-colors"
                    aria-label="Volver a la lista de productos"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                    Volver a la lista
                  </button>
                </div>
                {/* Middle: scrollable. flex-1 + overflow-y-auto + min-h-0
                    para que el footer no se aplaste. */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 sm:space-y-4 min-h-0">
                <div className="w-full h-28 sm:h-44 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                  {sel.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sel.imagen_url} alt={sel.nombre} className="w-full h-full object-contain" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-12 h-12 text-slate-300">
                      <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0L2.5 11.06ZM12 6.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-800">{sel.nombre}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    SKU <span className="font-mono">{sel.sku}</span>
                    {sel.codigo_barras && <> · <span className="font-mono">{sel.codigo_barras}</span></>}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <DetailItem
                    label={esPresupuesto ? "Precio referencia" : "Precio venta"}
                    value={`${formatGs(sel.precio_venta)} c/IVA`}
                    highlight
                  />
                  {sel.controla_stock !== false ? (
                    <DetailItem
                      label={esPresupuesto ? "Stock actual" : "Stock disp."}
                      value={`${dispSel} ${sel.unidad_medida}`}
                      highlight
                    />
                  ) : (
                    <DetailItem label="Tipo" value="Menú (preparado)" highlight />
                  )}
                </div>
                {esPresupuesto && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
                    Esta partida queda como <strong>estimación</strong>. No descuenta stock al guardar el presupuesto.
                  </div>
                )}

                {feedback && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${feedback.includes("✓") ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                    {feedback}
                  </div>
                )}

                <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
                  {/* Tipo de precio: solo en modo venta. En presupuesto se cotiza
                      precio puntual (no aplica minorista/mayorista/costo). */}
                  {!esPresupuesto && (
                    <div>
                      <label className="block text-[11px] uppercase text-slate-400 mb-1">Tipo de precio</label>
                      <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                        {(["minorista", "mayorista", "costo"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => handleTipoPrecio(t)}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                              tipoPrecio === t ? "bg-[#0EA5E9] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {t === "minorista" ? "Minorista" : t === "mayorista" ? "Mayorista" : "Al costo"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] uppercase text-slate-400 mb-1">
                        Cantidad ({sel.unidad_medida})
                      </label>
                      <input
                        type="text" inputMode="decimal" autoComplete="off"
                        value={cantidad}
                        onChange={(e) => setCantidad(e.target.value.replace(/[^\d.,-]/g, ""))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase text-slate-400 mb-1">
                        {esPresupuesto ? "Precio presupuestado c/IVA" : "Precio final con IVA"} ({moneda === "USD" ? "USD" : "€"})
                      </label>
                      <input
                        type="text" inputMode="decimal" autoComplete="off"
                        value={precio}
                        onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,-]/g, ""))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                      />
                      {moneda === "USD" && parseImporte(precio) > 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">≈ {formatGs(precioGsEquiv)}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase text-slate-400 mb-1">IVA</label>
                    <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                      {tasasIva.map((opt) => (
                        <button
                          key={opt} type="button"
                          onClick={() => setIva(opt)}
                          className={`flex-1 py-1.5 text-xs font-medium ${iva === opt ? "bg-[#0EA5E9] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                        >
                          {opt === "EXENTA" ? "Exento" : opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 space-y-0.5 pt-1">
                    <div className="flex justify-between">
                      <span>Base imponible</span>
                      <span className="tabular-nums">{formatGs(baseImponible)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IVA ({iva === "EXENTA" ? "Exento" : iva})</span>
                      <span className="tabular-nums">{formatGs(ivaMonto)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-200">
                      <span>{esPresupuesto ? "Total presupuestado" : "Total a cobrar"} (IVA incl.)</span>
                      <span className="tabular-nums">{formatGs(totalLinea)}</span>
                    </div>
                  </div>
                </div>
                </div>
                {/* Footer sticky con el boton de accion principal.
                    Siempre visible al final del panel, no requiere scroll. */}
                <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
                  <button
                    type="button"
                    onClick={handleAgregar}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold py-3 min-h-[48px] rounded-lg shadow-sm transition-colors"
                  >
                    + {esPresupuesto ? "Agregar al presupuesto" : "Agregar a la venta"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 border ${highlight ? "bg-white border-slate-200" : "bg-transparent border-transparent"}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-xs text-slate-700 truncate">{value ?? <span className="text-slate-300">—</span>}</div>
    </div>
  );
}
