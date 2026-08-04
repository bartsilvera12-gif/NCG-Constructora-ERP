"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { apiCreateCliente } from "@/lib/api/client";
import { filasTiposDesdeSistemaEstatico, fetchTiposFormCliente } from "@/lib/clientes/fetch-tipos-servicio-form";
import type { ClienteTipoServicioRow } from "@/lib/clientes/tipo-servicio-catalogo";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] bg-white text-sm";
const labelCls = "block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-4">
      <span className="inline-block w-1 h-4 bg-[#4FAEB2] rounded-full" />
      <h2 className="text-sm font-semibold text-slate-800">{children}</h2>
    </div>
  );
}

const REGIMEN_FISCAL_OPTS = [
  { value: "",                          label: "—" },
  { value: "regimen_general",           label: "Régimen general" },
  { value: "recargo_equivalencia",      label: "Recargo de equivalencia" },
  { value: "regimen_simplificado",      label: "Régimen simplificado (módulos)" },
  { value: "exento_iva",                label: "Exento de IVA (art. 20 LIVA)" },
  { value: "intracomunitario",          label: "Intracomunitario (NIF-IVA)" },
  { value: "extracomunitario",          label: "Extracomunitario / exportación" },
  { value: "inversion_sujeto_pasivo",   label: "Inversión del sujeto pasivo (ISP)" },
  { value: "no_sujeto",                 label: "No sujeto" },
  { value: "otro",                      label: "Otro" },
];
const FORMA_PAGO_OPTS = [
  { value: "",              label: "—" },
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo",      label: "Efectivo" },
  { value: "tarjeta",       label: "Tarjeta" },
  { value: "cheque",        label: "Cheque" },
  { value: "giro",          label: "Giro / domiciliación" },
  { value: "otro",          label: "Otro" },
];

function NuevoClienteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preNombre = searchParams?.get("nombre") ?? "";

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tiposServicio, setTiposServicio] = useState<ClienteTipoServicioRow[]>(
    filasTiposDesdeSistemaEstatico(),
  );

  const [form, setForm] = useState({
    tipo_cliente:      "empresa" as "empresa" | "persona",
    empresa:           "",
    nombre_contacto:   preNombre,
    contacto_persona:  "",
    ruc:               "",
    telefono:          "",
    email:             "",
    direccion:         "",
    codigo_postal:     "",
    ciudad:            "",
    provincia:         "",
    pais:              "España",
    fecha_alta:        new Date().toISOString().slice(0, 10),
    fecha_baja:        "",
    regimen_fiscal:    "regimen_general",
    forma_pago:        "transferencia",
    iban:              "",
    bic_swift:         "",
    tipo_servicio_cliente: "",
  });

  useEffect(() => {
    void fetchTiposFormCliente().then((rows) => rows.length > 0 && setTiposServicio(rows));
  }, []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // El API pide nombre_contacto obligatorio.
    const nombre =
      form.tipo_cliente === "empresa" && form.empresa.trim()
        ? form.empresa.trim()
        : form.nombre_contacto.trim();
    if (!nombre) {
      setError("Ingresá el nombre / razón social del cliente.");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        tipo_cliente: form.tipo_cliente,
        empresa: form.tipo_cliente === "empresa" ? (form.empresa.trim() || null) : null,
        nombre_contacto: nombre,
        contacto_persona: form.contacto_persona.trim() || null,
        ruc: form.ruc.trim() || null,
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        direccion: form.direccion.trim() || null,
        codigo_postal: form.codigo_postal.trim() || null,
        ciudad: form.ciudad.trim() || null,
        provincia: form.provincia.trim() || null,
        pais: form.pais.trim() || null,
        fecha_alta: form.fecha_alta || null,
        fecha_baja: form.fecha_baja || null,
        regimen_fiscal: form.regimen_fiscal || null,
        forma_pago: form.forma_pago || null,
        iban: form.iban.trim() || null,
        bic_swift: form.bic_swift.trim() || null,
        tipo_servicio_cliente: form.tipo_servicio_cliente || null,
        estado: form.fecha_baja ? "inactivo" : "activo",
        // Compat legado — el API sigue esperando estos aunque no los use.
        condicion_pago: "CONTADO",
        moneda_preferida: "EUR",
        origen: "MANUAL",
      };
      const res = await apiCreateCliente(payload);
      if (!res.ok) throw new Error(res.error);
      router.push(`/clientes/${res.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <PageHeader
        eyebrow="NCG · Comercial"
        title="Nuevo cliente"
        description="Cargá los datos fiscales y de contacto del cliente."
        backHref="/clientes"
        backLabel="Clientes"
      />

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos del cliente */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <SectionTitle>Datos del cliente</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Tipo</label>
              <select value={form.tipo_cliente} onChange={(e) => set("tipo_cliente", e.target.value as "empresa" | "persona")} className={inputCls}>
                <option value="empresa">Empresa</option>
                <option value="persona">Persona</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>{form.tipo_cliente === "empresa" ? "Nombre / Razón social" : "Nombre completo"} <span className="text-rose-500">*</span></label>
              <input
                value={form.tipo_cliente === "empresa" ? form.empresa : form.nombre_contacto}
                onChange={(e) => set(form.tipo_cliente === "empresa" ? "empresa" : "nombre_contacto", e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>N.I.F. / C.I.F.</label>
              <input value={form.ruc} onChange={(e) => set("ruc", e.target.value)} placeholder="B12345678" className={inputCls} />
            </div>

            <div className="md:col-span-4">
              <label className={labelCls}>Dirección</label>
              <input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="C/ Pablo de Olavide, 12" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Código postal</label>
              <input value={form.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} placeholder="28030" className={inputCls} />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Población</label>
              <input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} placeholder="San Fernando de Henares" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Provincia</label>
              <input value={form.provincia} onChange={(e) => set("provincia", e.target.value)} placeholder="Madrid" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>País</label>
              <input value={form.pais} onChange={(e) => set("pais", e.target.value)} className={inputCls} />
            </div>

            <div className="md:col-span-3">
              <label className={labelCls}>Teléfono</label>
              <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="916 723 562" className={inputCls} />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="contacto@ejemplo.es" className={inputCls} />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Persona de contacto</label>
              <input value={form.contacto_persona} onChange={(e) => set("contacto_persona", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha alta</label>
              <input type="date" value={form.fecha_alta} onChange={(e) => set("fecha_alta", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha baja</label>
              <input type="date" value={form.fecha_baja} onChange={(e) => set("fecha_baja", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Régimen fiscal</label>
              <select value={form.regimen_fiscal} onChange={(e) => set("regimen_fiscal", e.target.value)} className={inputCls}>
                {REGIMEN_FISCAL_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Forma de pago</label>
              <select value={form.forma_pago} onChange={(e) => set("forma_pago", e.target.value)} className={inputCls}>
                {FORMA_PAGO_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className={labelCls}>Tipo de servicio</label>
              <select value={form.tipo_servicio_cliente} onChange={(e) => set("tipo_servicio_cliente", e.target.value)} className={inputCls}>
                <option value="">— sin asignar —</option>
                {tiposServicio.filter((t) => t.activo !== false).map((t) => (
                  <option key={t.slug} value={t.slug}>{t.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Datos bancarios */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <SectionTitle>Datos bancarios</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-4">
              <label className={labelCls}>IBAN</label>
              <input value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="ES12 3456 7890 1234 5678 9012" className={`${inputCls} font-mono`} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>BIC / SWIFT</label>
              <input value={form.bic_swift} onChange={(e) => set("bic_swift", e.target.value)} placeholder="BBVAESMMXXX" className={`${inputCls} font-mono`} />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/clientes")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Grabar cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NuevoClientePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Cargando…</div>}>
      <NuevoClienteForm />
    </Suspense>
  );
}
