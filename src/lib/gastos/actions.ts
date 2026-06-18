import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getEmpresaId } from "@/lib/db/empresa";
import { ymdInicioFinMesLocal } from "@/lib/fechas/calendario";
import { getBrowserSupabaseForEmpresaData } from "@/lib/supabase/browser-data-client";

export type Moneda = "EUR" | "USD" | "GS";
export type IvaTipo = "21" | "10" | "4" | "exenta";

export type Gasto = {
  id: string;
  empresa_id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "fijo" | "variable";
  recurrente: boolean;
  frecuencia?: string;
  fecha: string;
  created_at: string;
  proyecto_id?: string | null;
  moneda?: Moneda;
  banco?: string | null;
  iva_deducible?: boolean;
  iva_tipo?: IvaTipo | null;
  monto_iva?: number;
};

export type GastoInput = {
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "fijo" | "variable";
  recurrente: boolean;
  frecuencia?: string;
  fecha: string;
  proyecto_id?: string | null;
  moneda?: Moneda;
  banco?: string | null;
  iva_deducible?: boolean;
  iva_tipo?: IvaTipo | null;
  monto_iva?: number;
};

function mapRow(r: Record<string, unknown>): Gasto {
  return {
    id: r.id as string,
    empresa_id: r.empresa_id as string,
    categoria: (r.categoria as string) ?? "",
    descripcion: (r.descripcion as string) ?? "",
    monto: Number(r.monto) ?? 0,
    tipo: (r.tipo as "fijo" | "variable") ?? "variable",
    recurrente: Boolean(r.recurrente),
    frecuencia: r.frecuencia as string | undefined,
    fecha: (r.fecha as string) ?? "",
    created_at: (r.created_at as string) ?? "",
    proyecto_id: (r.proyecto_id as string | null | undefined) ?? null,
    moneda: ((r.moneda as Moneda | undefined) ?? "EUR"),
    banco: (r.banco as string | null | undefined) ?? null,
    iva_deducible: Boolean(r.iva_deducible),
    iva_tipo: (r.iva_tipo as IvaTipo | null | undefined) ?? null,
    monto_iva: r.monto_iva != null ? Number(r.monto_iva) || 0 : 0,
  };
}

/** Obtiene todos los gastos de la empresa, ordenados por fecha desc. */
export async function getGastos(): Promise<Gasto[]> {
  if (typeof window !== "undefined") {
    const res = await fetchWithSupabaseSession("/api/gastos", { cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `Error ${res.status}`);
    }
    const json = (await res.json()) as { success?: boolean; data?: Record<string, unknown>[] };
    if (!json.success || !Array.isArray(json.data)) return [];
    return json.data.map(mapRow);
  }

  const supabase = await getBrowserSupabaseForEmpresaData();
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** Obtiene los gastos del mes actual (para Dashboard). RLS filtra por empresa. */
export async function getGastosMesActual(): Promise<Gasto[]> {
  const supabase = await getBrowserSupabaseForEmpresaData();
  const hoy = new Date();
  const { inicioYmd: inicioMes, finYmd: finMes } = ymdInicioFinMesLocal(hoy);

  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .gte("fecha", inicioMes)
    .lte("fecha", finMes)
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function createGasto(input: GastoInput): Promise<Gasto> {
  if (input.monto <= 0) throw new Error("El monto debe ser mayor a 0");

  const supabase = await getBrowserSupabaseForEmpresaData();
  const empresa_id = await getEmpresaId();

  const { data, error } = await supabase
    .from("gastos")
    .insert({
      empresa_id,
      categoria: input.categoria.trim() || null,
      descripcion: input.descripcion.trim() || null,
      monto: input.monto,
      tipo: input.tipo,
      recurrente: input.recurrente,
      frecuencia: input.frecuencia?.trim() || null,
      fecha: input.fecha,
      proyecto_id: input.proyecto_id ?? null,
      moneda: input.moneda ?? "EUR",
      banco: input.banco?.trim() || null,
      iva_deducible: Boolean(input.iva_deducible),
      iva_tipo: input.iva_deducible ? input.iva_tipo ?? null : null,
      monto_iva: input.iva_deducible ? Number(input.monto_iva ?? 0) || 0 : 0,
      // Gastos se asumen liquidados al cargarlos (mismo criterio que el backfill).
      monto_pagado: input.monto,
      fecha_pago: input.fecha,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function updateGasto(id: string, input: Partial<GastoInput>): Promise<Gasto> {
  if (input.monto !== undefined && input.monto <= 0) throw new Error("El monto debe ser mayor a 0");

  const supabase = await getBrowserSupabaseForEmpresaData();
  const update: Record<string, unknown> = {};
  if (input.categoria !== undefined) update.categoria = input.categoria.trim() || null;
  if (input.descripcion !== undefined) update.descripcion = input.descripcion.trim() || null;
  if (input.monto !== undefined) update.monto = input.monto;
  if (input.tipo !== undefined) update.tipo = input.tipo;
  if (input.recurrente !== undefined) update.recurrente = input.recurrente;
  if (input.frecuencia !== undefined) update.frecuencia = input.frecuencia?.trim() || null;
  if (input.fecha !== undefined) update.fecha = input.fecha;
  if (input.proyecto_id !== undefined) update.proyecto_id = input.proyecto_id;
  if (input.moneda !== undefined) update.moneda = input.moneda;
  if (input.banco !== undefined) update.banco = input.banco?.trim() || null;
  if (input.iva_deducible !== undefined) update.iva_deducible = input.iva_deducible;
  if (input.iva_tipo !== undefined) update.iva_tipo = input.iva_tipo;
  if (input.monto_iva !== undefined) update.monto_iva = input.monto_iva;

  const { data, error } = await supabase
    .from("gastos")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function deleteGasto(id: string): Promise<void> {
  const supabase = await getBrowserSupabaseForEmpresaData();
  const { error } = await supabase.from("gastos").delete().eq("id", id);

  if (error) throw new Error(error.message);
}
