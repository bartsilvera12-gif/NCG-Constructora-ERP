"use client";

/**
 * Autocomplete de clientes con creación rápida inline.
 *
 * - Lee /api/clientes una sola vez y filtra en memoria (la base es chica:
 *   tenant monocliente NCG, < 1000 clientes esperados).
 * - Al teclear muestra coincidencias por nombre/empresa/email/teléfono.
 * - Si no hay match exacto, aparece "+ Crear cliente «X»" que abre un modal
 *   con campos mínimos (nombre, teléfono, email, dirección, ciudad).
 * - Al seleccionar uno (existente o recién creado) llama onSelect con los
 *   datos relevantes para popular el form del presupuesto/venta de obra.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export interface ClienteRow {
  id: string;
  empresa: string | null;
  nombre_contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
}

export interface ClienteSeleccionado {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  ciudad: string;
  /** Razón social (solo si el cliente es empresa). */
  empresa?: string;
  /** Dirección completa (opcional, sobre todo para draft). */
  direccion?: string;
}

interface Props {
  /** Valor actual mostrado en el input (texto del cliente seleccionado o búsqueda). */
  value: string;
  /** Si hay un cliente del catálogo seleccionado, su id; "" si es texto libre o aún no eligió. */
  selectedId: string;
  /** Disparado al elegir un cliente existente o recién creado. */
  onSelect: (cli: ClienteSeleccionado) => void;
  /** Permite limpiar la selección y volver a escribir libremente. */
  onClear?: () => void;
  /** Texto libre cuando el usuario no quiere asociar a un cliente del catálogo. */
  onFreeText?: (texto: string) => void;
  placeholder?: string;
  required?: boolean;
  /**
   * Modo "draft": el botón "+ Crear cliente" NO persiste el cliente en el
   * catálogo. Solo emite los datos cargados como si el cliente estuviera
   * seleccionado (id=""), para que el padre los guarde en el documento. El
   * cliente real se crea recién cuando el documento se aprueba/convierte.
   */
  draftMode?: boolean;
}

function nombreDe(c: ClienteRow): string {
  const a = (c.empresa ?? "").trim();
  const b = (c.nombre_contacto ?? "").trim();
  if (a && b && a !== b) return `${a} · ${b}`;
  return a || b || "—";
}

export default function ClientePicker({
  value, selectedId, onSelect, onClear, onFreeText, placeholder, required, draftMode,
}: Props) {
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState(value);
  const [creando, setCreando] = useState(false);
  /** True cuando el "+ Crear cliente" se uso en draftMode y el padre todavia no
   *  tiene un cliente real. Se resetea cuando el usuario tipea, limpia o
   *  selecciona uno del catalogo. */
  const [isDraft, setIsDraft] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincroniza el input cuando cambia el value externo (por ejemplo, al
  // limpiar el form o cuando se setea desde otro lado).
  useEffect(() => { setBusqueda(value); }, [value]);

  // Carga inicial del listado completo. Para tenants chicos es la opción más
  // simple y evita race conditions con queries por keystroke.
  useEffect(() => {
    let cancelled = false;
    fetchWithSupabaseSession("/api/clientes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: ClienteRow[]; error?: string }) => {
        if (cancelled) return;
        if (j?.success && Array.isArray(j.data)) {
          setClientes(j.data);
        } else {
          setLoadErr(j?.error ?? "No se pudo cargar el listado de clientes");
        }
      })
      .catch((e) => { if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Error de red"); });
    return () => { cancelled = true; };
  }, []);

  // Cierre del dropdown al hacer click fuera.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, []);

  const q = busqueda.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return clientes.slice(0, 20);
    return clientes
      .filter((c) => {
        const blob = [
          c.empresa, c.nombre_contacto, c.email, c.telefono,
        ].map((s) => (s ?? "").toLowerCase()).join(" ");
        return blob.includes(q);
      })
      .slice(0, 30);
  }, [clientes, q]);

  // Si el texto coincide exactamente con un cliente, ocultamos el "Crear".
  const hayMatchExacto = useMemo(
    () => matches.some((c) => nombreDe(c).toLowerCase() === q || (c.nombre_contacto ?? "").toLowerCase() === q),
    [matches, q]
  );

  function elegir(c: ClienteRow, draft = false) {
    onSelect({
      id: c.id,
      nombre: nombreDe(c),
      telefono: (c.telefono ?? "").trim(),
      email: (c.email ?? "").trim(),
      ciudad: (c.ciudad ?? "").trim(),
      empresa: (c.empresa ?? "").trim(),
      direccion: (c.direccion ?? "").trim(),
    });
    setIsDraft(draft);
    setBusqueda(nombreDe(c));
    setOpen(false);
    inputRef.current?.blur();
  }

  function abrirCreacion() {
    setCreando(true);
    setOpen(false);
  }

  // En draftMode no abrimos modal: emitimos directamente un draft con el
  // nombre tipeado. Los demas campos los completa el form del presupuesto.
  function crearDraftDirecto() {
    const txt = busqueda.trim();
    if (!txt) return;
    const draft: ClienteRow = {
      id: "",
      empresa: null,
      nombre_contacto: txt,
      telefono: null,
      email: null,
      direccion: null,
      ciudad: null,
    };
    elegir(draft, true);
  }

  function handleChange(v: string) {
    setBusqueda(v);
    setOpen(true);
    // Si había un cliente seleccionado y el usuario empezó a tipear, lo
    // desligamos para que el cliente_id no quede obsoleto.
    if (selectedId) onClear?.();
    if (isDraft) setIsDraft(false);
    onFreeText?.(v);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          ref={inputRef}
          value={busqueda}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Buscar cliente por nombre, email, teléfono…"}
          required={required}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
        />
        {(selectedId || isDraft) && (
          <button
            type="button"
            onClick={() => { onClear?.(); setIsDraft(false); setBusqueda(""); inputRef.current?.focus(); }}
            title="Quitar cliente seleccionado"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>

      {selectedId && !isDraft && (
        <p className="mt-1 text-[11px] text-emerald-700 inline-flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
          Cliente del catálogo vinculado
        </p>
      )}
      {isDraft && (
        <p className="mt-1 text-[11px] text-amber-700 inline-flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          Cliente nuevo — se crea al aprobar el presupuesto
        </p>
      )}
      {loadErr && (
        <p className="mt-1 text-[11px] text-amber-700">No se pudo cargar el catálogo de clientes: {loadErr}. Podés escribir el nombre libre.</p>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <ul className="max-h-64 overflow-y-auto py-1 text-sm">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400">
                {q ? `Sin clientes que coincidan con "${busqueda}"` : "El catálogo está vacío"}
              </li>
            ) : (
              matches.map((c) => (
                <li
                  key={c.id}
                  onMouseDown={(e) => { e.preventDefault(); elegir(c); }}
                  className="cursor-pointer px-3 py-2 hover:bg-slate-50"
                >
                  <div className="font-medium text-slate-800">{nombreDe(c)}</div>
                  <div className="text-[11px] text-slate-500 flex gap-2 flex-wrap">
                    {c.telefono && <span>📞 {c.telefono}</span>}
                    {c.email && <span>✉ {c.email}</span>}
                    {c.ciudad && <span>📍 {c.ciudad}</span>}
                  </div>
                </li>
              ))
            )}
          </ul>
          {q && !hayMatchExacto && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (draftMode) crearDraftDirecto();
                else abrirCreacion();
              }}
              className="block w-full border-t border-slate-100 bg-[#E5F4F4] px-3 py-2 text-left text-xs font-semibold text-[#3F8E91] hover:bg-[#D2EBEB]"
            >
              {draftMode
                ? `+ Usar «${busqueda.trim()}» como contacto nuevo`
                : `+ Crear cliente «${busqueda.trim()}»`}
            </button>
          )}
        </div>
      )}

      {creando && (
        <NuevoClienteModal
          nombreInicial={busqueda.trim()}
          draftMode={draftMode === true}
          onClose={() => setCreando(false)}
          onCreado={(c, isDraftCreated) => {
            // En draftMode no sumamos a la lista del catalogo: el cliente aun
            // no existe en BD. Si se persistio (modo normal), si lo agregamos.
            if (!isDraftCreated) {
              setClientes((prev) => [c, ...prev]);
            }
            setCreando(false);
            elegir(c, isDraftCreated);
          }}
        />
      )}
    </div>
  );
}

function NuevoClienteModal({
  nombreInicial, draftMode, onClose, onCreado,
}: {
  nombreInicial: string;
  draftMode: boolean;
  onClose: () => void;
  onCreado: (c: ClienteRow, isDraft: boolean) => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [empresa, setEmpresa] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { setErr("El nombre es obligatorio"); return; }
    setBusy(true); setErr(null);
    try {
      // En draftMode no creamos el cliente en BD: emitimos los datos cargados
      // como ClienteRow "borrador" (id="") para que el padre los guarde en el
      // documento. El alta real se hace cuando el presupuesto se aprueba.
      if (draftMode) {
        const draft: ClienteRow = {
          id: "",
          empresa: empresa.trim() || null,
          nombre_contacto: nombre.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          direccion: direccion.trim() || null,
          ciudad: ciudad.trim() || null,
        };
        onCreado(draft, true);
        return;
      }
      const r = await fetchWithSupabaseSession("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_cliente: empresa.trim() ? "empresa" : "persona",
          nombre_contacto: nombre.trim(),
          empresa: empresa.trim() || null,
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          direccion: direccion.trim() || null,
          ciudad: ciudad.trim() || null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: ClienteRow; error?: string };
      if (!r.ok || !j.success || !j.data) {
        setErr(j.error ?? `No se pudo crear el cliente (${r.status})`);
        return;
      }
      onCreado(j.data, false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4"
      onClick={() => { if (!busy) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="px-5 pt-5 pb-2">
          <h3 className="text-base font-semibold text-slate-900">Nuevo cliente</h3>
          <p className="mt-1 text-xs text-slate-500">
            {draftMode
              ? "Datos mínimos del contacto. El cliente se crea recién cuando se aprueba el presupuesto, así no quedan registros sueltos si se rechaza."
              : "Datos mínimos para vincularlo al documento. Podés completar el resto luego desde Clientes."}
          </p>
        </div>
        <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre / contacto <span className="text-red-500">*</span></label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Empresa <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Razón social"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ciudad</label>
            <input value={ciudad} onChange={(e) => setCiudad(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
        </div>
        {err && <div className="px-5 pb-2 text-xs text-red-600">{err}</div>}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !nombre.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                <path d="M17 10a7 7 0 0 1-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {busy ? "Guardando…" : draftMode ? "Guardar contacto" : "Crear cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}
