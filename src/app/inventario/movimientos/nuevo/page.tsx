"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import PageHeader from "@/components/ui/PageHeader";
import { getProductos, saveMovimiento } from "@/lib/inventario/storage";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Producto, TipoMovimiento, OrigenMovimiento } from "@/lib/inventario/types";

type ProyectoLite = { id: string; titulo: string };

export default function NuevoMovimientoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tipoQuery = (searchParams?.get("tipo") ?? "").toUpperCase();
  const proyectoIdQuery = searchParams?.get("proyecto_id") ?? "";

  const tipoInicial: TipoMovimiento =
    tipoQuery === "SALIDA" || tipoQuery === "AJUSTE" ? (tipoQuery as TipoMovimiento) : "ENTRADA";
  const origenInicial: OrigenMovimiento =
    tipoInicial === "ENTRADA" ? "compra" : tipoInicial === "SALIDA" ? "venta" : "ajuste_manual";

  const [productos, setProductos] = useState<Producto[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoLite[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    producto_id: "",
    tipo: tipoInicial,
    cantidad: "",
    costo_unitario: "",
    origen: origenInicial,
    proyecto_id: proyectoIdQuery,
    motivo: tipoInicial === "SALIDA" && proyectoIdQuery ? "uso_obra" : "",
    observacion: "",
  });

  useEffect(() => {
    let cancelled = false;
    getProductos().then((data) => {
      if (!cancelled) setProductos(data);
    });
    // Cargar obras activas para el selector. Si falla, el campo queda vacío y opcional.
    fetch("/api/proyectos", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { id: string; titulo: string }[] }) => {
        if (!cancelled && j.success && Array.isArray(j.data)) {
          setProyectos(j.data.map((p) => ({ id: p.id, titulo: p.titulo })));
        }
      })
      .catch(() => { /* sin proyectos: el select queda vacío */ });
    return () => { cancelled = true; };
  }, []);

  function handleProductoChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    const producto = productos.find((p) => p.id === id);
    setForm((prev) => ({
      ...prev,
      producto_id: id,
      costo_unitario: producto ? String(producto.costo_promedio) : "",
    }));
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleTipoChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const tipo = e.target.value as TipoMovimiento;
    const origenSugerido: OrigenMovimiento =
      tipo === "ENTRADA" ? "compra" : tipo === "SALIDA" ? "venta" : "ajuste_manual";
    setForm((prev) => ({
      ...prev,
      tipo,
      origen: origenSugerido,
      // El motivo solo aplica a SALIDA; al cambiar a otro tipo lo limpiamos.
      motivo: tipo === "SALIDA" ? prev.motivo : "",
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const productoSeleccionado = productos.find((p) => p.id === form.producto_id);
    if (!productoSeleccionado) {
      setErrorMsg("Seleccioná un producto.");
      return;
    }

    const cantidadNum =
      form.tipo === "AJUSTE"
        ? parseFloat(form.cantidad)
        : Math.abs(parseFloat(form.cantidad));

    if (!Number.isFinite(cantidadNum) || (form.tipo !== "AJUSTE" && cantidadNum <= 0)) {
      setErrorMsg("Cantidad inválida.");
      return;
    }

    // Validación clave: salida con uso_obra requiere obra.
    if (form.tipo === "SALIDA" && form.motivo === "uso_obra" && !form.proyecto_id) {
      setErrorMsg("Para salidas con motivo 'Uso en obra' es obligatorio seleccionar la obra.");
      return;
    }

    setSubmitting(true);
    try {
      // SALIDA con motivo va por endpoint dedicado: persiste motivo/observación, valida stock y descuenta.
      if (form.tipo === "SALIDA" && form.motivo) {
        const resp = await fetchWithSupabaseSession("/api/inventario/movimientos/salida", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            producto_id: productoSeleccionado.id,
            cantidad: cantidadNum,
            motivo: form.motivo,
            proyecto_id: form.proyecto_id || undefined,
            observacion: form.observacion || undefined,
          }),
        });
        const j = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (!resp.ok || !j.success) {
          setErrorMsg(j.error ?? "No se pudo registrar la salida.");
          return;
        }
      } else {
        const guardado = await saveMovimiento({
          producto_id: productoSeleccionado.id,
          producto_nombre: productoSeleccionado.nombre,
          producto_sku: productoSeleccionado.sku,
          tipo: form.tipo,
          cantidad: cantidadNum,
          costo_unitario: parseFloat(form.costo_unitario) || 0,
          origen: form.origen,
          fecha: new Date().toISOString(),
          proyecto_id: form.proyecto_id || null,
        });
        if (!guardado) {
          setErrorMsg("No se pudo guardar el movimiento.");
          return;
        }
      }

      // Si vino desde una obra, volver al detalle de la obra (pestaña Materiales).
      if (proyectoIdQuery) {
        router.push(`/dashboard/proyectos/${proyectoIdQuery}?tab=materiales`);
      } else {
        router.push("/inventario/movimientos");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const productoSeleccionado = productos.find((p) => p.id === form.producto_id);

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-gray-500 transition-colors text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-2";

  return (
    <div className="space-y-8">

      <PageHeader
        eyebrow="NCG · Stock"
        title="Nuevo movimiento"
        description="Registra una entrada, salida o ajuste de stock"
        backHref="/inventario/movimientos"
        backLabel="Movimientos"
      />

      <div className="bg-white rounded-xl shadow-sm ring-1 ring-[#4FAEB2]/10 border border-slate-200 p-6 max-w-2xl">
        {proyectoIdQuery && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Esta salida se imputará a la obra seleccionada.
          </div>
        )}
        {errorMsg && (
          <div className="mb-5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorMsg}
          </div>
        )}
        <form className="space-y-6" onSubmit={handleSubmit}>

          {/* Producto */}
          <div>
            <label className={labelClass}>Producto</label>
            <select
              name="producto_id"
              value={form.producto_id}
              onChange={handleProductoChange}
              className={inputClass}
              required
            >
              <option value="">Seleccionar producto...</option>
              {productos.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.nombre} — {p.sku} (stock actual: {p.stock_actual})
                </option>
              ))}
            </select>
          </div>

          {/* Tipo + Origen */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Tipo de movimiento</label>
              <select
                name="tipo"
                value={form.tipo}
                onChange={handleTipoChange}
                className={inputClass}
              >
                <option value="ENTRADA">ENTRADA — aumenta stock</option>
                <option value="SALIDA">SALIDA — disminuye stock</option>
                <option value="AJUSTE">AJUSTE — corrección manual</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Origen</label>
              <select
                name="origen"
                value={form.origen}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="compra">Compra</option>
                <option value="venta">Venta</option>
                <option value="ajuste_manual">Ajuste manual</option>
              </select>
            </div>
          </div>

          {/* Motivo (solo SALIDA): habilita validaciones y trazabilidad por obra. */}
          {form.tipo === "SALIDA" && (
            <div>
              <label className={labelClass}>
                Motivo de la salida
                {form.motivo === "uso_obra" && (
                  <span className="ml-2 text-xs text-red-600 font-normal">
                    (requiere obra)
                  </span>
                )}
              </label>
              <select
                name="motivo"
                value={form.motivo}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="">— Salida genérica —</option>
                <option value="uso_obra">Uso en obra</option>
                <option value="consumo_interno">Consumo interno</option>
                <option value="rotura">Rotura / pérdida</option>
                <option value="ajuste">Ajuste</option>
                <option value="entrega_cuadrilla">Entrega a cuadrilla</option>
                <option value="transferencia_vehiculo">Transferencia a vehículo</option>
              </select>
            </div>
          )}

          {/* Obra / Proyecto al que se imputa el movimiento (opcional, recomendado
              en SALIDAS para que el costo y materiales se sumen por obra). */}
          <div>
            <label className={labelClass}>
              Obra / Proyecto
              {form.tipo === "SALIDA" && form.motivo === "uso_obra" && (
                <span className="ml-2 text-xs text-red-600 font-normal">
                  (obligatorio)
                </span>
              )}
              {form.tipo === "SALIDA" && form.motivo !== "uso_obra" && (
                <span className="ml-2 text-xs text-amber-600 font-normal">
                  (recomendado para imputar materiales a la obra)
                </span>
              )}
            </label>
            <select
              name="proyecto_id"
              value={form.proyecto_id}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="">Sin obra asociada</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>{p.titulo}</option>
              ))}
            </select>
          </div>

          {/* Observación: visible para SALIDA porque el endpoint /salida la persiste. */}
          {form.tipo === "SALIDA" && (
            <div>
              <label className={labelClass}>Observación (opcional)</label>
              <input
                type="text"
                name="observacion"
                value={form.observacion}
                onChange={handleChange}
                placeholder="Ej: refuerzo zona perimetral"
                className={inputClass}
              />
            </div>
          )}

          {/* Cantidad + Costo unitario */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>
                Cantidad
                {form.tipo === "AJUSTE" && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    (negativo para disminuir)
                  </span>
                )}
              </label>
              <input
                type="number"
                name="cantidad"
                value={form.cantidad}
                onChange={handleChange}
                placeholder={form.tipo === "AJUSTE" ? "Ej: -3 o +5" : "Ej: 10"}
                className={inputClass}
                step="1"
                required
              />
            </div>

            <div>
              <label className={labelClass}>Costo unitario (€)</label>
              <MontoInput
                value={form.costo_unitario}
                onChange={(n) => setForm((prev) => ({ ...prev, costo_unitario: String(n) }))}
                placeholder="Ej: 35000"
                className={inputClass}
                decimals
                required
              />
            </div>
          </div>

          {/* Nota de fecha automática */}
          <p className="text-xs text-gray-400">
            La fecha y hora del movimiento se registrarán automáticamente al guardar.
          </p>

          {/* Vista previa del impacto en stock */}
          {productoSeleccionado && form.cantidad !== "" && (
            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50 text-sm space-y-1">
              <p className="font-medium text-gray-700 mb-2">Vista previa del impacto</p>
              <div className="flex justify-between text-gray-600">
                <span>Stock actual</span>
                <span className="font-semibold tabular-nums">
                  {productoSeleccionado.stock_actual} uds.
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Movimiento ({form.tipo})</span>
                <span className={`font-semibold tabular-nums ${
                  form.tipo === "ENTRADA"
                    ? "text-green-600"
                    : form.tipo === "SALIDA"
                    ? "text-red-600"
                    : "text-yellow-600"
                }`}>
                  {form.tipo === "ENTRADA" ? "+" : form.tipo === "SALIDA" ? "−" : ""}
                  {form.tipo !== "AJUSTE"
                    ? Math.abs(parseFloat(form.cantidad) || 0)
                    : parseFloat(form.cantidad) || 0}{" "}
                  uds.
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold text-gray-800">
                <span>Stock resultante</span>
                <span className="tabular-nums">
                  {Math.max(
                    0,
                    form.tipo === "ENTRADA"
                      ? productoSeleccionado.stock_actual + Math.abs(parseFloat(form.cantidad) || 0)
                      : form.tipo === "SALIDA"
                      ? productoSeleccionado.stock_actual - Math.abs(parseFloat(form.cantidad) || 0)
                      : productoSeleccionado.stock_actual + (parseFloat(form.cantidad) || 0)
                  )}{" "}
                  uds.
                </span>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-gray-900 text-white px-5 py-3 rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {submitting ? "Guardando…" : "Guardar movimiento"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/inventario/movimientos")}
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
