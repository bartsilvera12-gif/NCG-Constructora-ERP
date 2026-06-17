"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import PageHeader from "@/components/ui/PageHeader";
import { getProducto, productoExiste, updateProducto } from "@/lib/inventario/storage";
import { generarEan13 } from "@/lib/inventario/ean13";
import type { MetodoValuacion } from "@/lib/inventario/types";
import ProductImageUploader from "@/components/inventario/ProductImageUploader";
import SelectFromList from "@/components/inventario/SelectFromList";

// Opciones estándar de unidad de medida (UX simplificada gastro)
const UNIDADES_OPCIONES = [
  "UNIDAD","PAR","KG","G","LT","ML","CAJA","BOLSA","PAQUETE","DOCENA","LATA","BOTELLA","PORCION","COMBO",
] as const;

const TIPO_SUMMARY = {
  reventa: { titulo: "Producto de reventa", descripcion: "Se compra y se vende tal cual. Controla stock y descuenta al vender.", icono: "🥤" },
  menu:    { titulo: "Producto del menú",   descripcion: "Se vende en Ventas y genera pedido. No descuenta stock directo.",     icono: "🌭" },
  materia: { titulo: "Materia prima / insumo", descripcion: "Se usa para recetas y costeo. No aparece como producto de venta.", icono: "🌾" },
} as const;

interface CatRow { id: string; nombre: string }
interface UbiRow { id: string; nombre: string; tipo: string }
interface ProvRow { id: string; nombre: string }

export default function EditarProductoPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) ?? "";

  const [cargando, setCargando] = useState(true);
  const [errorDuplicado, setErrorDuplicado] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  // descripcion live separately because form se inicializa al cargar
  const [descripcion, setDescripcion] = useState("");
  const [tipoInv, setTipoInv] = useState<"material" | "herramienta">("material");
  // Solo aplica si tipoInv='herramienta'. Default 'nueva' para no romper UI cuando
  // el producto aún no tiene valor cargado (productos legacy).
  const [estadoHerramienta, setEstadoHerramienta] = useState<"nueva" | "usada">("nueva");
  const [form, setForm] = useState({
    nombre: "",
    sku: "",
    codigo_barras: "",
    costo_promedio: "",
    ultimo_costo: "",
    precio_minorista: "",
    markup_minorista: "",
    precio_mayorista: "",
    markup_mayorista: "",
    stock_actual: "",
    stock_minimo: "",
    unidad_medida: "",
    metodo_valuacion: "CPP" as MetodoValuacion,
  });
  const [imagenPath, setImagenPath] = useState<string | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generandoCodigo, setGenerandoCodigo] = useState(false);
  const [codigoGeneradoInterno, setCodigoGeneradoInterno] = useState(false);

  // Relaciones
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [ubicacionId, setUbicacionId] = useState<string | null>(null);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<CatRow[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbiRow[]>([]);
  const [proveedores, setProveedores] = useState<ProvRow[]>([]);

  // Clasificación gastronómica
  const [esVendible, setEsVendible] = useState(true);
  const [esInsumo, setEsInsumo] = useState(false);

  // Tipo gastro inferido a partir de los flags (para UX simplificada)
  type TipoGastro = "reventa" | "menu" | "materia";
  const [tipoGastro, setTipoGastro] = useState<TipoGastro>("reventa");

  // Configuración gastronómica
  const [controlaStock, setControlaStock] = useState(true);
  const [valorizado, setValorizado] = useState(true);
  const [unidadCompra, setUnidadCompra] = useState("");
  const [unidadReceta, setUnidadReceta] = useState("");
  const [factorCompraReceta, setFactorCompraReceta] = useState("1");
  const [tiempoPrepMinutos, setTiempoPrepMinutos] = useState("0");

  useEffect(() => {
    let cancel = false;
    async function load(url: string) {
      try {
        const r = await fetch(url, { credentials: "include" });
        const j = await r.json();
        return r.ok && j?.success ? j.data : null;
      } catch { return null; }
    }
    (async () => {
      const [cats, ubis, provs] = await Promise.all([
        load("/api/inventario/categorias"),
        load("/api/inventario/ubicaciones"),
        load("/api/proveedores"),
      ]);
      if (cancel) return;
      if (cats?.categorias) setCategorias(cats.categorias as CatRow[]);
      if (ubis?.ubicaciones) setUbicaciones(ubis.ubicaciones as UbiRow[]);
      if (provs?.proveedores) setProveedores(provs.proveedores as ProvRow[]);
    })();
    return () => { cancel = true; };
  }, []);

  async function handleGenerarCodigoInterno() {
    if (generandoCodigo) return;
    setGenerandoCodigo(true);
    setErrorDuplicado(null);
    setErrorGeneral(null);
    try {
      const res = await fetch("/api/productos/codigo-interno", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.success && json.data?.codigo) {
        // El código interno (INT-…) cumple la función de SKU interno: se carga
        // directamente en el campo unificado "Código interno / SKU" (columna sku).
        setForm((prev) => ({ ...prev, sku: json.data.codigo as string }));
        setCodigoGeneradoInterno(true);
      } else {
        setErrorGeneral(json?.error ?? "No se pudo generar el código.");
      }
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : "Error de red");
    } finally {
      setGenerandoCodigo(false);
    }
  }

  /** Genera un código de barras EAN-13 numérico con dígito verificador válido. */
  function handleGenerarEan13() {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    setForm((prev) => ({ ...prev, codigo_barras: generarEan13() }));
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getProducto(id).then((p) => {
      if (cancelled || !p) return;
      const costo = p.costo_promedio;
      // Fallback de compatibilidad: si el producto viejo no tiene minorista/mayorista,
      // rowToProducto ya los deriva desde precio_venta. Acá calculamos los markups.
      const min = p.precio_minorista ?? p.precio_venta;
      const may = p.precio_mayorista ?? min;
      const markupMin = costo > 0 && min > 0 ? ((min - costo) / costo) * 100 : 0;
      const markupMay = costo > 0 && may > 0 ? ((may - costo) / costo) * 100 : 0;
      setTipoInv((p.tipo_inventario as "material" | "herramienta" | undefined) ?? "material");
      setEstadoHerramienta(p.estado_herramienta === "usada" ? "usada" : "nueva");
      setForm({
        nombre: p.nombre,
        sku: p.sku,
        codigo_barras: p.codigo_barras ?? "",
        costo_promedio: String(p.costo_promedio),
        ultimo_costo: p.ultimo_costo != null ? String(p.ultimo_costo) : String(p.costo_promedio),
        precio_minorista: String(min),
        markup_minorista: markupMin.toFixed(2),
        precio_mayorista: String(may),
        markup_mayorista: markupMay.toFixed(2),
        stock_actual: String(p.stock_actual),
        stock_minimo: String(p.stock_minimo),
        unidad_medida: p.unidad_medida,
        metodo_valuacion: p.metodo_valuacion,
      });
      setImagenPath(p.imagen_path ?? null);
      setImagenUrl(p.imagen_url ?? null);
      setCategoriaId(p.categoria_principal_id ?? null);
      setUbicacionId(p.ubicacion_principal_id ?? null);
      setProveedorId(p.proveedor_principal_id ?? null);
      const esVend = p.es_vendible ?? true;
      const esIns = p.es_insumo ?? false;
      const ctrlStock = p.controla_stock ?? true;
      setEsVendible(esVend);
      setEsInsumo(esIns);
      setControlaStock(ctrlStock);
      setDescripcion(p.descripcion ?? "");
      setValorizado(p.valorizado ?? true);
      setUnidadCompra(p.unidad_compra ?? "");
      setUnidadReceta(p.unidad_receta ?? "");
      setFactorCompraReceta(String(p.factor_compra_receta ?? 1));
      setTiempoPrepMinutos(String(p.tiempo_prep_minutos ?? 0));
      // Inferir tipo gastro a partir de los flags
      if (esIns) setTipoGastro("materia");
      else if (esVend && !ctrlStock) setTipoGastro("menu");
      else setTipoGastro("reventa");
    }).finally(() => {
      if (!cancelled) setCargando(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    if (e.target.name === "sku") setCodigoGeneradoInterno(false);
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  /** Cambia costo → recalcula AMBOS markups sin mover los precios. */
  function handleCostoChange(costo: number) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    const min = parseFloat(form.precio_minorista);
    const may = parseFloat(form.precio_mayorista);
    setForm((prev) => ({
      ...prev,
      costo_promedio: String(costo),
      markup_minorista:
        !isNaN(costo) && costo > 0 && !isNaN(min) && min > 0
          ? (((min - costo) / costo) * 100).toFixed(2)
          : prev.markup_minorista,
      markup_mayorista:
        !isNaN(costo) && costo > 0 && !isNaN(may) && may > 0
          ? (((may - costo) / costo) * 100).toFixed(2)
          : prev.markup_mayorista,
    }));
  }

  /** Cambia precio minorista → recalcula markup minorista. */
  function handleMinoristaChange(precio: number) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    const costo = parseFloat(form.costo_promedio);
    setForm((prev) => ({
      ...prev,
      precio_minorista: String(precio),
      markup_minorista:
        !isNaN(precio) && !isNaN(costo) && costo > 0
          ? (((precio - costo) / costo) * 100).toFixed(2)
          : prev.markup_minorista,
    }));
  }

  /** Cambia markup minorista → recalcula precio minorista. */
  function handleMarkupMinoristaChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    const markup = parseFloat(e.target.value);
    const costo = parseFloat(form.costo_promedio);
    setForm((prev) => ({
      ...prev,
      markup_minorista: e.target.value,
      precio_minorista:
        !isNaN(markup) && !isNaN(costo) && costo > 0
          ? (costo * (1 + markup / 100)).toFixed(0)
          : prev.precio_minorista,
    }));
  }

  /** Cambia precio mayorista → recalcula markup mayorista. */
  function handleMayoristaChange(precio: number) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    const costo = parseFloat(form.costo_promedio);
    setForm((prev) => ({
      ...prev,
      precio_mayorista: String(precio),
      markup_mayorista:
        !isNaN(precio) && !isNaN(costo) && costo > 0
          ? (((precio - costo) / costo) * 100).toFixed(2)
          : prev.markup_mayorista,
    }));
  }

  /** Cambia markup mayorista → recalcula precio mayorista. */
  function handleMarkupMayoristaChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    const markup = parseFloat(e.target.value);
    const costo = parseFloat(form.costo_promedio);
    setForm((prev) => ({
      ...prev,
      markup_mayorista: e.target.value,
      precio_mayorista:
        !isNaN(markup) && !isNaN(costo) && costo > 0
          ? (costo * (1 + markup / 100)).toFixed(0)
          : prev.precio_mayorista,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    console.log("[inventario/editar] handleSubmit start", { id });
    if (submitting) return;
    setErrorDuplicado(null);
    setErrorGeneral(null);
    setSubmitting(true);

    const showErr = (msg: string) => {
      setErrorGeneral(msg);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    };

    try {
      // Código interno / SKU obligatorio para reventa (mismo criterio que el alta).
      if (tipoGastro === "reventa" && !form.sku.trim()) {
        showErr("El código interno / SKU es obligatorio para productos de reventa.");
        return;
      }

      // Código de barras = NUMÉRICO escaneable (EAN-13). El código interno / SKU
      // va en el campo sku.
      const codigoBarras = form.codigo_barras.trim();
      if (codigoBarras && !/^\d+$/.test(codigoBarras)) {
        showErr("El código de barras debe ser numérico (escaneable). El código interno / SKU va en su propio campo.");
        return;
      }

      // Pre-chequeo de duplicado: tolerante a fallos de red — si la consulta falla,
      // seguimos. El backend igual valida unicidad en el PATCH.
      try {
        const duplicado = await productoExiste(form.sku, form.nombre);
        if (duplicado && duplicado.id !== id) {
          setErrorDuplicado(`Ya existe "${duplicado.nombre}" con SKU ${duplicado.sku}.`);
          try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
          return;
        }
      } catch (err) {
        console.warn("[inventario/editar] productoExiste failed, ignorando:", err);
      }

      const precioMinorista = parseFloat(form.precio_minorista) || 0;
      // Mayorista cae a minorista si quedó vacío (nunca 0 accidental).
      const precioMayorista = parseFloat(form.precio_mayorista) || precioMinorista;
      const costoPromedioBase = parseFloat(form.costo_promedio) || 0;
      const ultimoCostoBase = form.ultimo_costo.trim() !== ""
        ? parseFloat(form.ultimo_costo) || 0
        : costoPromedioBase;
      const updatePayload: Parameters<typeof updateProducto>[1] = {
        nombre: form.nombre.trim().toUpperCase(),
        sku: form.sku.trim().toUpperCase(),
        costo_promedio: costoPromedioBase,
        ultimo_costo: ultimoCostoBase,
        precio_minorista: precioMinorista,
        precio_mayorista: precioMayorista,
        // Espejo de minorista por compatibilidad (el server también lo fuerza).
        precio_venta: precioMinorista,
        stock_actual: parseInt(form.stock_actual) || 0,
        stock_minimo: parseInt(form.stock_minimo) || 0,
        unidad_medida: form.unidad_medida.trim().toUpperCase() || "UNIDAD",
        metodo_valuacion: form.metodo_valuacion,
        categoria_principal_id: categoriaId,
        ubicacion_principal_id: ubicacionId,
        proveedor_principal_id: proveedorId,
        es_vendible: esVendible,
        es_insumo: esInsumo,
        controla_stock: controlaStock,
        valorizado: valorizado,
        unidad_compra: unidadCompra.trim() || null,
        unidad_receta: unidadReceta.trim() || null,
        factor_compra_receta: Math.max(parseFloat(factorCompraReceta) || 1, 0.0001),
        tiempo_prep_minutos: Math.max(parseInt(tiempoPrepMinutos) || 0, 0),
        descripcion: descripcion.trim() || null,
        codigo_barras: codigoBarras || null,
        // codigo_interno se OMITE del payload a propósito: el PATCH no lo toca,
        // preservando el valor existente en productos ya creados (compatibilidad).
        codigo_barras_interno: false,
        tipo_inventario: tipoInv,
        estado_herramienta: tipoInv === "herramienta" ? estadoHerramienta : null,
      };

      console.log("[inventario/editar] sending PATCH", { id, payloadKeys: Object.keys(updatePayload) });
      const actualizado = await updateProducto(id, updatePayload);
      console.log("[inventario/editar] PATCH result:", actualizado ? { id: actualizado.id, nombre: actualizado.nombre } : "null");
      if (actualizado) {
        router.push("/inventario");
      } else {
        showErr("No se pudo guardar los cambios. Revisá los datos e intentá nuevamente.");
      }
    } catch (err) {
      console.error("[inventario/editar] handleSubmit error:", err);
      showErr(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setSubmitting(false);
    }
  }

  const costo = parseFloat(form.costo_promedio);
  const precio = parseFloat(form.precio_minorista);
  const tieneAmbos = !isNaN(costo) && !isNaN(precio) && costo > 0 && precio > 0;
  const markupCalc = tieneAmbos ? ((precio - costo) / costo) * 100 : null;
  const margenVentaCalc = tieneAmbos ? ((precio - costo) / precio) * 100 : null;
  const esPerdida = markupCalc !== null && markupCalc < 0;

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-gray-500 transition-colors text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-2";

  if (cargando) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="NCG · Stock"
          title="Editar producto"
          backHref="/inventario"
          backLabel="Inventario"
        />
        <p className="text-gray-500 animate-pulse">Cargando…</p>
      </div>
    );
  }

  const summary = TIPO_SUMMARY[tipoGastro];
  const showStock = tipoGastro === "reventa";
  const showPrecioVenta = tipoGastro !== "materia";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="NCG · Stock"
        title="Editar producto"
        description="Modifica los datos del producto"
        backHref="/inventario"
        backLabel="Inventario"
      />

      <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5 max-w-5xl">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-slate-900">{summary.titulo}</div>
            <div className="text-sm text-slate-600 mt-0.5">{summary.descripcion}</div>
          </div>
          <div className="text-xs text-gray-400 shrink-0 italic">Cambiar tipo: editar flags</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 max-w-5xl">
        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          {errorGeneral && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{errorGeneral}</p>
            </div>
          )}
          {errorDuplicado && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-700">{errorDuplicado}</p>
            </div>
          )}

          <div>
            <label className={labelClass}>Nombre del producto</label>
            <input
              type="text"
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              className={`${inputClass} uppercase`}
              required
            />
          </div>

          <div>
            <label className={labelClass}>
              Descripción
              {tipoGastro === "menu" && <span className="text-xs font-normal text-rose-700 ml-2">(visible al cliente)</span>}
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={
                tipoGastro === "menu"
                  ? "Ej: Pan, carne, huevo, doble queso, lechuga, tomate, mayonesa."
                  : "Descripción opcional del producto"
              }
              rows={tipoGastro === "menu" ? 3 : 2}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>
                Código interno / SKU
                {tipoGastro === "reventa" ? "" : <span className="text-xs font-normal text-gray-400 ml-1">(opcional)</span>}
                {codigoGeneradoInterno && form.sku && (
                  <span className="ml-2 align-middle text-[10px] uppercase tracking-wider bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
                    Generado
                  </span>
                )}
              </label>
              <input
                type="text"
                name="sku"
                value={form.sku}
                onChange={handleChange}
                className={`${inputClass} uppercase`}
                required={tipoGastro === "reventa"}
                autoComplete="off"
              />
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleGenerarCodigoInterno}
                  disabled={generandoCodigo}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0v2.431l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
                  </svg>
                  {generandoCodigo ? "Generando..." : "Generar código interno"}
                </button>
                <span className="ml-2 text-xs text-gray-400">Identifica el producto en el ERP</span>
              </div>
            </div>
            <div className={tipoGastro === "menu" ? "hidden" : ""}>
              <label className={labelClass}>Unidad de medida</label>
              <select
                name="unidad_medida"
                value={form.unidad_medida}
                onChange={handleChange}
                className={`${inputClass} uppercase`}
                required={tipoGastro !== "menu"}
              >
                {(() => {
                  const cur = (form.unidad_medida ?? "").trim().toUpperCase();
                  const opts = (UNIDADES_OPCIONES as readonly string[]).includes(cur) || !cur
                    ? UNIDADES_OPCIONES
                    : [...UNIDADES_OPCIONES, cur];
                  return opts.map((u) => (
                    <option key={u} value={u}>
                      {u}
                      {!((UNIDADES_OPCIONES as readonly string[]).includes(u)) ? " (actual)" : ""}
                    </option>
                  ));
                })()}
              </select>
            </div>
          </div>

          {tipoInv === "herramienta" && (
            <div>
              <label className={labelClass}>Estado de la herramienta</label>
              <div className="grid grid-cols-2 gap-2 max-w-md">
                {(["nueva", "usada"] as const).map((opt) => {
                  const activo = estadoHerramienta === opt;
                  const labelOpt = opt === "nueva" ? "Nueva" : "Usada";
                  const descOpt = opt === "nueva"
                    ? "Adquisición reciente, sin uso previo."
                    : "Ya tiene uso o vino de otra obra.";
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEstadoHerramienta(opt)}
                      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                        activo
                          ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className={`text-sm font-semibold ${activo ? "text-amber-800" : "text-slate-700"}`}>
                        {labelOpt}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{descOpt}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Código de barras (EAN-13 numérico, escaneable con lector) */}
          <div>
            <label className={labelClass}>
              Código de barras
              <span className="text-xs font-normal text-gray-400 ml-1">(numérico · escaneable con lector)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              name="codigo_barras"
              value={form.codigo_barras}
              onChange={handleChange}
              placeholder="Escaneá o escribí el código numérico (EAN-13)"
              className={inputClass}
              autoComplete="off"
            />
            <div className="mt-2">
              <button
                type="button"
                onClick={handleGenerarEan13}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900 border border-emerald-200 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M3 4.75A.75.75 0 0 1 3.75 4h.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75V4.75ZM6 4.75A.75.75 0 0 1 6.75 4h.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-.5A.75.75 0 0 1 6 15.25V4.75ZM9.5 4.75A.75.75 0 0 1 10.25 4h1.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V4.75ZM14 4.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V4.75Z" />
                </svg>
                Generar código de barras EAN-13
              </button>
              <span className="ml-2 text-xs text-gray-400">Solo si no trae uno de fábrica</span>
            </div>
          </div>

          {/* Imagen del producto */}
          <div>
            <label className={labelClass}>Imagen del producto</label>
            <ProductImageUploader
              productoId={id}
              initialUrl={imagenUrl}
              initialPath={imagenPath}
              onChange={(info) => {
                setImagenPath(info.imagen_path);
                setImagenUrl(info.imagen_url);
              }}
            />
          </div>

          {/* Clasificación, Proveedor, Ubicación */}
          <div className="border-t border-slate-100 pt-6">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                Clasificación y ubicación
              </p>
              <span className="text-xs text-gray-400">Opcional</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-4 min-w-0">
                <label className={labelClass}>Categoría principal</label>
                <SelectFromList
                  value={categoriaId}
                  onChange={setCategoriaId}
                  options={categorias.map((c) => ({ id: c.id, label: c.nombre }))}
                  emptyShort="Sin categorías"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400 truncate">
                    {categorias.length === 0 ? "Todavía no cargaste categorías." : `${categorias.length} disponibles`}
                  </span>
                  <Link
                    href="/inventario/categorias"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-2.5 py-1 rounded-md transition-colors"
                  >
                    + Crear
                  </Link>
                </div>
              </div>
              <div className={`md:col-span-4 min-w-0 ${tipoGastro === "menu" ? "hidden" : ""}`}>
                <label className={labelClass}>Proveedor principal</label>
                <SelectFromList
                  value={proveedorId}
                  onChange={setProveedorId}
                  options={proveedores.map((p) => ({ id: p.id, label: p.nombre }))}
                  emptyShort="Sin proveedores"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400 truncate">
                    {proveedores.length === 0 ? "Todavía no cargaste proveedores." : `${proveedores.length} disponibles`}
                  </span>
                  <Link
                    href="/proveedores/nuevo"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-2.5 py-1 rounded-md transition-colors"
                  >
                    + Crear
                  </Link>
                </div>
              </div>
              {/* Ubicación principal — oculta en instancia En lo de Mari (no aplica para gastronomía). */}
              <div className="hidden md:col-span-4 min-w-0">
                <label className={labelClass}>Ubicación principal</label>
                <SelectFromList
                  value={ubicacionId}
                  onChange={setUbicacionId}
                  options={ubicaciones.map((u) => ({ id: u.id, label: u.nombre, sublabel: u.tipo }))}
                  emptyShort="Sin ubicaciones"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400 truncate">
                    {ubicaciones.length === 0 ? "Todavía no cargaste ubicaciones." : `${ubicaciones.length} disponibles`}
                  </span>
                  <Link
                    href="/inventario/ubicaciones"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-2.5 py-1 rounded-md transition-colors"
                  >
                    + Crear
                  </Link>
                </div>
              </div>
            </div>

            {/* Clasificación — oculta (presets vienen del tipo gastro inferido) */}
            <div className="hidden mt-5 pt-4 border-t border-gray-100">
              <label className={labelClass}>Clasificación</label>
              <div className="flex flex-wrap gap-4 mt-1">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={esVendible}
                    onChange={(e) => setEsVendible(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  Vendible (se vende al cliente final)
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={esInsumo}
                    onChange={(e) => setEsInsumo(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  Insumo (se usa en recetas)
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Puede ser ambos (producto mixto).
              </p>
            </div>

            {/* Configuración gastronómica — oculta (no relevante en UX simplificada) */}
            <div className="hidden mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-3">
                Configuración gastronómica
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={controlaStock}
                    onChange={(e) => setControlaStock(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  Controlar stock
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={valorizado}
                    onChange={(e) => setValorizado(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  Valorizado
                </label>
                <div>
                  <label className={labelClass}>Unidad de compra</label>
                  <input
                    type="text"
                    value={unidadCompra}
                    onChange={(e) => setUnidadCompra(e.target.value)}
                    placeholder='Ej: "Bolsa 25kg"'
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Unidad de receta</label>
                  <input
                    type="text"
                    value={unidadReceta}
                    onChange={(e) => setUnidadReceta(e.target.value)}
                    placeholder='Ej: "g"'
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Factor compra → receta</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={factorCompraReceta}
                    onChange={(e) => setFactorCompraReceta(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Tiempo preparación (min)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={tiempoPrepMinutos}
                    onChange={(e) => setTiempoPrepMinutos(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Ejemplo: Harina se compra por bolsa de 25kg, pero se usa en recetas por gramos. En ese caso unidad compra = bolsa 25kg, unidad receta = g, factor = 25000.
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">Precios</p>

            <div className="sm:max-w-xs">
              <label className={labelClass}>Costo promedio (€)</label>
              <MontoInput
                value={form.costo_promedio}
                onChange={handleCostoChange}
                className={inputClass}
                decimals
                required
              />
            </div>

            {showPrecioVenta && (
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Minorista */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-700 mb-3">Minorista (público)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Precio (€)</label>
                      <MontoInput
                        value={form.precio_minorista}
                        onChange={handleMinoristaChange}
                        className={inputClass}
                        decimals
                        required={showPrecioVenta}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Markup (%)</label>
                      <input
                        type="number"
                        value={form.markup_minorista}
                        onChange={handleMarkupMinoristaChange}
                        className={inputClass}
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                {/* Mayorista */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-700 mb-3">
                    Mayorista <span className="font-normal text-gray-400">(opcional)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Precio (€)</label>
                      <MontoInput
                        value={form.precio_mayorista}
                        onChange={handleMayoristaChange}
                        className={inputClass}
                        decimals
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Markup (%)</label>
                      <input
                        type="number"
                        value={form.markup_mayorista}
                        onChange={handleMarkupMayoristaChange}
                        className={inputClass}
                        step="0.01"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">Si lo dejás vacío, se usa el minorista.</p>
                </div>
              </div>
            )}
            {tieneAmbos && markupCalc !== null && margenVentaCalc !== null && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className={`border rounded-lg px-4 py-3 ${esPerdida ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-100"}`}>
                  <p className={`text-xs font-medium mb-1 ${esPerdida ? "text-red-500" : "text-blue-500"}`}>Markup</p>
                  <p className={`text-lg font-bold tabular-nums ${esPerdida ? "text-red-700" : "text-blue-700"}`}>
                    {markupCalc.toFixed(2)}%
                  </p>
                </div>
                <div className={`border rounded-lg px-4 py-3 ${esPerdida ? "bg-red-50 border-red-200" : "bg-green-50 border-green-100"}`}>
                  <p className={`text-xs font-medium mb-1 ${esPerdida ? "text-red-500" : "text-green-500"}`}>Margen s/venta</p>
                  <p className={`text-lg font-bold tabular-nums ${esPerdida ? "text-red-700" : "text-green-700"}`}>
                    {margenVentaCalc.toFixed(2)}%
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 ${showStock ? "" : "hidden"}`}>
            <div>
              <label className={labelClass}>Stock actual</label>
              <input
                type="number"
                name="stock_actual"
                value={form.stock_actual}
                onChange={handleChange}
                className={inputClass}
                min={0}
                required={showStock}
              />
              <p className="mt-1 text-xs text-gray-400">
                Para ajustes de stock, preferí registrar un <Link href="/inventario/movimientos/nuevo" className="underline">movimiento</Link>.
              </p>
            </div>
            <div>
              <label className={labelClass}>Stock mínimo</label>
              <input
                type="number"
                name="stock_minimo"
                value={form.stock_minimo}
                onChange={handleChange}
                className={inputClass}
                min={0}
                required={showStock}
              />
            </div>
          </div>

          {/* Método de valuación — oculto en instancia En lo de Mari (siempre CPP). */}
          <div className="hidden">
            <label className={labelClass}>Método de valuación</label>
            <select
              name="metodo_valuacion"
              value={form.metodo_valuacion}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="CPP">CPP — Costo Promedio Ponderado</option>
              <option value="FIFO">FIFO — Primero en entrar, primero en salir</option>
              <option value="LIFO">LIFO — Último en entrar, primero en salir</option>
            </select>
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-gray-900 text-white px-5 py-3 rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/inventario")}
              className="border border-gray-300 px-5 py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
