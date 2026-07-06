import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { buildMarcacionesPdf, type MarcacionRow, type MarcacionesEmpresa } from "@/lib/rrhh/marcaciones-pdf";

export const runtime = "nodejs";

/** GET /api/rrhh/fichajes/reporte-pdf?empleadoId=&desde=&hasta= */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const sp = new URL(request.url).searchParams;
    const empleadoId = sp.get("empleadoId");
    const hoy = new Date();
    const desdeDefault = new Date(hoy); desdeDefault.setDate(hoy.getDate() - 30);
    const desde = sp.get("desde") ?? desdeDefault.toISOString().slice(0, 10);
    const hasta = sp.get("hasta") ?? hoy.toISOString().slice(0, 10);

    let q = ctx.supabase
      .from("empleado_fichajes")
      .select("fecha, hora_entrada, hora_salida, horas, observacion, marcado_kiosco, empleado_id, empleados:empleado_id(nombre)")
      .eq("empresa_id", ctx.auth.empresa_id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true });
    if (empleadoId) q = q.eq("empleado_id", empleadoId);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const fichajes: MarcacionRow[] = (data ?? []).map((row: Record<string, unknown>) => {
      const emp = row.empleados as { nombre?: string } | { nombre?: string }[] | null;
      const e = Array.isArray(emp) ? emp[0] : emp;
      return {
        fecha: String(row.fecha),
        empleado_id: (row.empleado_id as string | null) ?? null,
        empleado_nombre: e?.nombre ?? null,
        hora_entrada: (row.hora_entrada as string | null) ?? null,
        hora_salida: (row.hora_salida as string | null) ?? null,
        horas: row.horas !== null && row.horas !== undefined ? Number(row.horas) : null,
        observacion: (row.observacion as string | null) ?? null,
        marcado_kiosco: (row.marcado_kiosco as boolean | null) ?? null,
      };
    });

    // Feriados y ausencias del rango — para colorear el PDF.
    const [feriadosQ, ausenciasQ] = await Promise.all([
      ctx.supabase
        .from("feriados")
        .select("fecha, nombre")
        .eq("empresa_id", ctx.auth.empresa_id)
        .gte("fecha", desde)
        .lte("fecha", hasta),
      (() => {
        let a = ctx.supabase
          .from("empleado_ausencias")
          .select("empleado_id, fecha_desde, fecha_hasta, tipo, observacion, empleados:empleado_id(nombre)")
          .eq("empresa_id", ctx.auth.empresa_id)
          .lte("fecha_desde", hasta)
          .gte("fecha_hasta", desde);
        if (empleadoId) a = a.eq("empleado_id", empleadoId);
        return a;
      })(),
    ]);
    const feriados = (feriadosQ.data ?? []) as Array<{ fecha: string; nombre: string }>;
    const ausencias = (ausenciasQ.data ?? []).map((row: Record<string, unknown>) => {
      const emp = row.empleados as { nombre?: string } | { nombre?: string }[] | null;
      const e = Array.isArray(emp) ? emp[0] : emp;
      return {
        empleado_id: String(row.empleado_id),
        empleado_nombre: e?.nombre ?? null,
        fecha_desde: String(row.fecha_desde),
        fecha_hasta: String(row.fecha_hasta),
        tipo: row.tipo as "reposo" | "vacaciones" | "permiso" | "baja" | "otro",
        observacion: (row.observacion as string | null) ?? null,
      };
    });

    // Empresa + nombre empleado (si aplica)
    const [empresaQ, empQ] = await Promise.all([
      ctx.supabase.from("empresas")
        .select("nombre_empresa, nif, centro_trabajo_direccion")
        .eq("id", ctx.auth.empresa_id).maybeSingle(),
      empleadoId
        ? ctx.supabase.from("empleados").select("nombre").eq("empresa_id", ctx.auth.empresa_id).eq("id", empleadoId).maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
    ]);
    const empresaRow = empresaQ.data as { nombre_empresa?: string | null; nif?: string | null; centro_trabajo_direccion?: string | null } | null;
    const empresa: MarcacionesEmpresa = {
      nombre: empresaRow?.nombre_empresa ?? null,
      nif: empresaRow?.nif ?? null,
      centro: empresaRow?.centro_trabajo_direccion ?? null,
    };
    const empleadoNombre = (empQ.data as { nombre?: string } | null)?.nombre ?? null;

    // Expando filas: una por (día, empleado) en el rango para que aparezcan
    // feriados y ausencias aunque no haya fichaje. Si hay fichaje, se usa;
    // si no, la fila queda con horas vacías pero con el tag de feriado/ausencia.
    const filas = expandirFilasPorDia({
      desde,
      hasta,
      fichajes,
      feriados,
      ausencias,
      empleadoIdFiltro: empleadoId,
      empleadoNombreFiltro: empleadoNombre,
    });

    const bytes = await buildMarcacionesPdf(empresa, empleadoNombre, desde, hasta, filas, {
      feriados,
      ausencias,
      empleadoIdFiltro: empleadoId,
    });

    const slug = (empleadoNombre ?? "todos")
      .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
    const filename = `marcaciones-${slug}-${desde}-${hasta}.pdf`;

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

// ── Expansión día × empleado ────────────────────────────────────────────────

type AusenciaLite = {
  empleado_id: string;
  empleado_nombre: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  tipo: "reposo" | "vacaciones" | "permiso" | "baja" | "otro";
  observacion: string | null;
};

function iterarDias(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${desde}T00:00:00Z`);
  const h = new Date(`${hasta}T00:00:00Z`);
  for (let cur = new Date(d); cur.getTime() <= h.getTime(); cur.setUTCDate(cur.getUTCDate() + 1)) {
    dias.push(cur.toISOString().slice(0, 10));
  }
  return dias;
}

function expandirFilasPorDia(opts: {
  desde: string;
  hasta: string;
  fichajes: MarcacionRow[];
  feriados: Array<{ fecha: string; nombre: string }>;
  ausencias: AusenciaLite[];
  empleadoIdFiltro: string | null;
  empleadoNombreFiltro: string | null;
}): MarcacionRow[] {
  const { desde, hasta, fichajes, feriados, ausencias, empleadoIdFiltro, empleadoNombreFiltro } = opts;

  // Empleados a expandir: si hay filtro, solo ese; si no, todos los que aparecen
  // en fichajes o ausencias del rango.
  const empleadosMap = new Map<string, string | null>();
  if (empleadoIdFiltro) {
    empleadosMap.set(empleadoIdFiltro, empleadoNombreFiltro);
  } else {
    for (const f of fichajes) if (f.empleado_id) empleadosMap.set(f.empleado_id, f.empleado_nombre);
    for (const a of ausencias) empleadosMap.set(a.empleado_id, a.empleado_nombre);
  }

  // Index de fichajes por (empleado_id, fecha) → fila.
  const fichajesIdx = new Map<string, MarcacionRow>();
  for (const f of fichajes) {
    if (!f.empleado_id) continue;
    fichajesIdx.set(`${f.empleado_id}::${f.fecha}`, f);
  }
  const feriadoSet = new Set(feriados.map((f) => f.fecha));
  const tieneAusenciaEnFecha = (empId: string, fecha: string) =>
    ausencias.some((a) => a.empleado_id === empId && a.fecha_desde <= fecha && a.fecha_hasta >= fecha);

  // Si hay filtro de empleado, expandimos TODO el rango (incluye días sin
  // marcación para que se noten los faltantes). Sin filtro, cortamos en el
  // último día con actividad para no listar 30 días × N empleados vacíos.
  const conFiltroEmpleado = !!empleadoIdFiltro;
  const ultimaFecha = conFiltroEmpleado
    ? hasta
    : (() => {
        let last = desde;
        for (const f of fichajes) if (f.fecha > last && f.fecha <= hasta) last = f.fecha;
        for (const a of ausencias) {
          const fin = a.fecha_hasta > hasta ? hasta : a.fecha_hasta;
          if (fin > last && fin >= desde) last = fin;
        }
        for (const fr of feriados) if (fr.fecha > last && fr.fecha <= hasta) last = fr.fecha;
        return last;
      })();

  const dias = iterarDias(desde, ultimaFecha);
  const filas: MarcacionRow[] = [];

  for (const fecha of dias) {
    for (const [empId, empNombre] of empleadosMap) {
      const key = `${empId}::${fecha}`;
      const fichaje = fichajesIdx.get(key);
      if (fichaje) {
        filas.push(fichaje);
        continue;
      }
      // Sin fichaje. Con filtro de empleado emitimos siempre (para ver faltantes).
      // Sin filtro, solo si es feriado o el empleado tiene ausencia.
      const esFeriado = feriadoSet.has(fecha);
      const tieneAusencia = tieneAusenciaEnFecha(empId, fecha);
      if (conFiltroEmpleado || esFeriado || tieneAusencia) {
        filas.push({
          fecha,
          empleado_id: empId,
          empleado_nombre: empNombre,
          hora_entrada: null,
          hora_salida: null,
          horas: null,
          observacion: null,
          marcado_kiosco: null,
        });
      }
    }
  }

  // Ordenar por fecha ascendente y luego por nombre de empleado.
  filas.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return (a.empleado_nombre ?? "").localeCompare(b.empleado_nombre ?? "");
  });
  return filas;
}
