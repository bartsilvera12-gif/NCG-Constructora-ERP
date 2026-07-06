import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/rrhh/feriados/importar-espana?anio=2026
 *
 * Carga los feriados nacionales de España para un año dado.
 * Idempotente: usa upsert con onConflict (empresa_id, fecha).
 * Los feriados regionales/locales se cargan manualmente.
 */

type FeriadoDef = { mes: number; dia: number; nombre: string };

const FERIADOS_FIJOS_ES: FeriadoDef[] = [
  { mes: 1,  dia: 1,  nombre: "Año Nuevo" },
  { mes: 1,  dia: 6,  nombre: "Epifanía del Señor" },
  { mes: 5,  dia: 1,  nombre: "Día del Trabajador" },
  { mes: 8,  dia: 15, nombre: "Asunción de la Virgen" },
  { mes: 10, dia: 12, nombre: "Fiesta Nacional de España" },
  { mes: 11, dia: 1,  nombre: "Todos los Santos" },
  { mes: 12, dia: 6,  nombre: "Día de la Constitución" },
  { mes: 12, dia: 8,  nombre: "Inmaculada Concepción" },
  { mes: 12, dia: 25, nombre: "Navidad" },
];

// Viernes Santo por año (Pascua se calcula, pero prefiero tabla explícita para claridad).
const VIERNES_SANTO: Record<number, string> = {
  2024: "2024-03-29",
  2025: "2025-04-18",
  2026: "2026-04-03",
  2027: "2027-03-26",
  2028: "2028-04-14",
  2029: "2029-03-30",
  2030: "2030-04-19",
};

function pad(n: number): string { return String(n).padStart(2, "0"); }

export async function POST(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const sp = new URL(request.url).searchParams;
  const anioRaw = sp.get("anio") ?? String(new Date().getUTCFullYear());
  const anio = parseInt(anioRaw, 10);
  if (!Number.isFinite(anio) || anio < 2020 || anio > 2100) {
    return NextResponse.json(errorResponse("Año inválido."), { status: 400 });
  }

  const feriados = FERIADOS_FIJOS_ES.map((f) => ({
    empresa_id: ctx.auth.empresa_id,
    fecha: `${anio}-${pad(f.mes)}-${pad(f.dia)}`,
    nombre: f.nombre,
    ambito: "nacional",
    created_by: ctx.auth.usuarioCatalogId ?? null,
  }));
  const viernesSanto = VIERNES_SANTO[anio];
  if (viernesSanto) {
    feriados.push({
      empresa_id: ctx.auth.empresa_id,
      fecha: viernesSanto,
      nombre: "Viernes Santo",
      ambito: "nacional",
      created_by: ctx.auth.usuarioCatalogId ?? null,
    });
  }

  const { data, error } = await ctx.supabase
    .from("feriados")
    .upsert(feriados, { onConflict: "empresa_id,fecha" })
    .select("id, fecha, nombre");
  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse({ importados: data?.length ?? 0, anio }));
}
