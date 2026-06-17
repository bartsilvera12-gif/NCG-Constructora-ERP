import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/ventas/[id]/convertir-obra
 *
 * Convierte un presupuesto aprobado en una OBRA (proyectos).
 * - No descuenta stock, no genera movimientos, no registra compras/gastos.
 * - Copia los datos del presupuesto al brief de obra para que la obra "nazca armada".
 * - Vincula bidireccionalmente: ventas.proyecto_id ↔ proyectos.presupuesto_origen_id.
 * - Bloquea conversión duplicada.
 *
 * Body opcional: { titulo?: string }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });
    const empresaId = ctx.auth.empresa_id;

    // 1. Cargar la venta
    const { data: venta, error: e1 } = await ctx.supabase
      .from("ventas")
      .select("id, numero_control, cliente_id, total, subtotal, monto_iva, tipo_documento, estado_presupuesto, proyecto_id, presupuesto_meta, fecha")
      .eq("id", id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (e1) return NextResponse.json(errorResponse(e1.message), { status: 400 });
    if (!venta) return NextResponse.json(errorResponse("Presupuesto no encontrado"), { status: 404 });

    const v = venta as {
      id: string;
      numero_control: string | null;
      cliente_id: string | null;
      total: number | string;
      subtotal: number | string;
      monto_iva: number | string;
      tipo_documento: string | null;
      estado_presupuesto: string | null;
      proyecto_id: string | null;
      presupuesto_meta: Record<string, unknown> | null;
      fecha: string;
    };
    const meta = (v.presupuesto_meta ?? {}) as Record<string, unknown>;

    if (v.tipo_documento !== "presupuesto") {
      return NextResponse.json(errorResponse("Esta venta no es un presupuesto."), { status: 400 });
    }
    if (v.estado_presupuesto === "convertido" || v.proyecto_id) {
      return NextResponse.json(errorResponse("Este presupuesto ya fue convertido en obra."), { status: 400 });
    }
    if (v.estado_presupuesto !== "aprobado") {
      return NextResponse.json(errorResponse("Solo presupuestos aprobados se convierten en obra."), { status: 400 });
    }

    // 2. Cargar partidas del presupuesto (estimadas).
    const { data: itemsRaw, error: eItems } = await ctx.supabase
      .from("ventas_items")
      .select("producto_id, producto_nombre, sku, cantidad, precio_venta, subtotal, monto_iva, total_linea, tipo_iva, tipo_partida, descripcion")
      .eq("venta_id", v.id)
      .eq("empresa_id", empresaId);
    if (eItems) return NextResponse.json(errorResponse(eItems.message), { status: 400 });
    const items = (itemsRaw ?? []) as Array<{
      producto_id: string | null;
      producto_nombre: string | null;
      sku: string | null;
      cantidad: number | string;
      precio_venta: number | string;
      subtotal: number | string;
      monto_iva: number | string;
      total_linea: number | string;
      tipo_iva: string | null;
      tipo_partida: string | null;
      descripcion: string | null;
    }>;

    // 3. Estado inicial y tipo de proyecto (resolución defensiva).
    const [estadoQ, tipoDefQ] = await Promise.all([
      ctx.supabase.from("proyecto_estados")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .eq("es_estado_inicial", true)
        .order("sort_order", { ascending: true })
        .limit(1),
      ctx.supabase.from("proyecto_tipos")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);
    if (estadoQ.error) return NextResponse.json(errorResponse(estadoQ.error.message), { status: 400 });
    if (tipoDefQ.error) return NextResponse.json(errorResponse(tipoDefQ.error.message), { status: 400 });

    const estadoId = (estadoQ.data ?? [])[0]?.id as string | undefined;
    const tipoIdDefault = (tipoDefQ.data ?? [])[0]?.id as string | undefined;
    if (!estadoId) return NextResponse.json(errorResponse("Falta configurar al menos un estado inicial activo."), { status: 400 });
    if (!tipoIdDefault) return NextResponse.json(errorResponse("Falta configurar al menos un tipo de proyecto."), { status: 400 });

    // tipo_id: prioriza meta.tipo_obra_id; si no, intenta resolver por codigo (meta.tipo_servicio); fallback al primer activo.
    const metaTipoObraId = typeof meta.tipo_obra_id === "string" ? meta.tipo_obra_id.trim() : "";
    const metaTipoServicio = typeof meta.tipo_servicio === "string" ? meta.tipo_servicio.trim().toLowerCase() : "";
    let tipoId = tipoIdDefault;
    if (metaTipoObraId) {
      const tipoCheck = await ctx.supabase
        .from("proyecto_tipos")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("id", metaTipoObraId)
        .eq("activo", true)
        .maybeSingle();
      if (tipoCheck.data) tipoId = (tipoCheck.data as { id: string }).id;
    } else if (metaTipoServicio) {
      // Match flexible por codigo del catálogo de la empresa.
      const tipoByCod = await ctx.supabase
        .from("proyecto_tipos")
        .select("id, codigo")
        .eq("empresa_id", empresaId)
        .eq("activo", true);
      if (!tipoByCod.error && Array.isArray(tipoByCod.data)) {
        const list = tipoByCod.data as Array<{ id: string; codigo: string | null }>;
        const norm = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
        const target = norm(metaTipoServicio);
        const hit = list.find((t) => norm(t.codigo).includes(target) || target.includes(norm(t.codigo)));
        if (hit) tipoId = hit.id;
      }
    }

    // 4. Título de la obra (prioridad).
    const body = (await request.json().catch(() => ({}))) as { titulo?: string };
    const tituloProp = body.titulo?.trim();
    const tituloMeta = typeof meta.titulo_obra === "string" ? meta.titulo_obra.trim() : "";
    const clienteContacto = typeof meta.cliente_contacto === "string" ? meta.cliente_contacto.trim() : "";
    let tituloFallbackTipo = "";
    if (!tituloProp && !tituloMeta && clienteContacto) {
      // Intentar derivar nombre del tipo elegido para "Tipo + Cliente".
      const tipoNombreQ = await ctx.supabase
        .from("proyecto_tipos")
        .select("nombre")
        .eq("empresa_id", empresaId)
        .eq("id", tipoId)
        .maybeSingle();
      const tipoNombre = (tipoNombreQ.data as { nombre?: string } | null)?.nombre?.trim() ?? "";
      if (tipoNombre) tituloFallbackTipo = `${tipoNombre} — ${clienteContacto}`;
    }
    const titulo =
      tituloProp
      || tituloMeta
      || tituloFallbackTipo
      || `Obra (de presupuesto ${v.numero_control ?? id.slice(0, 8)})`;

    // 5. Mapeo presupuesto_meta → claves que consume el tab "Datos de obra" del proyecto.
    //    (Ver PROYECTO_OBRA_BRIEF_FIELDS en src/lib/proyectos/brief-data.ts)
    const str = (x: unknown): string | null => {
      if (typeof x === "string") { const t = x.trim(); return t ? t : null; }
      if (typeof x === "number" && Number.isFinite(x)) return String(x);
      return null;
    };
    const num = (x: unknown): number | null => {
      if (typeof x === "number" && Number.isFinite(x)) return x;
      if (typeof x === "string" && x.trim() !== "") { const n = Number(x); return Number.isFinite(n) ? n : null; }
      return null;
    };

    const partidas = items.map((it) => ({
      producto_id: it.producto_id,
      producto_nombre: it.producto_nombre ?? it.descripcion ?? "",
      sku: it.sku ?? "",
      tipo_partida: (it.tipo_partida ?? "producto"),
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad) || 0,
      precio_unitario: Number(it.precio_venta) || 0,
      subtotal: Number(it.subtotal) || 0,
      monto_iva: Number(it.monto_iva) || 0,
      total_linea: Number(it.total_linea) || 0,
      tipo_iva: it.tipo_iva,
    }));
    const materialesEstimados = partidas.filter((p) => p.tipo_partida === "producto");
    const manoObraEstimada = partidas.filter((p) => p.tipo_partida === "mano_obra");

    const totales = {
      subtotal: Number(v.subtotal) || 0,
      iva: Number(v.monto_iva) || 0,
      total: Number(v.total) || 0,
      margen_pct: num(meta.margen_pct),
      margen_monto: num(meta.margen_monto),
    };

    const brief_data: Record<string, unknown> = {
      // Trazabilidad de origen
      source: "presupuesto_obra",
      origen: "presupuesto",
      presupuesto_id: v.id,
      presupuesto_numero: v.numero_control,
      venta_id: v.id,
      numero_control: v.numero_control,
      fecha_presupuesto: v.fecha,

      // Snapshot completo del presupuesto_meta (para no perder info)
      presupuesto_meta: meta,

      // Claves consumidas por el tab "Datos de obra" del proyecto
      direccion_obra:          str(meta.ubicacion),
      zona_ciudad:             str(meta.cliente_zona),
      superficie_estimada:     str(meta.superficie_m2),
      unidad_principal:        str(meta.unidad_principal) ?? "m2",
      descripcion_trabajo:     str(meta.descripcion),
      observaciones_tecnicas:  str(meta.observaciones_tecnicas),
      condiciones_comerciales: str(meta.condiciones_servicio) ?? str(meta.condiciones),
      garantia_mano_obra:      str(meta.garantia_mano_obra),
      garantia_materiales:     str(meta.garantia_materiales),
      fecha_inicio:            str(meta.fecha_inicio_estimada),
      fecha_fin:               str(meta.plazo_estimado),

      // Datos de cliente del presupuesto (siempre útiles aunque cliente_id ya esté)
      cliente_contacto:        str(meta.cliente_contacto),
      cliente_telefono:        str(meta.cliente_telefono),
      cliente_email:           str(meta.cliente_email),

      // Partidas (estimadas)
      items: partidas,
      partidas,
      materiales_estimados: materialesEstimados,
      mano_obra_estimada: manoObraEstimada,

      // Condiciones y totales
      exclusiones:     str(meta.exclusiones),
      forma_pago:      str(meta.forma_pago),
      plazo_estimado:  str(meta.plazo_estimado),
      validez_dias:    num(meta.validez_dias),
      tipo_servicio:   str(meta.tipo_servicio),

      totales,
    };

    // 6. fecha_prometida desde meta.fecha_inicio_estimada (si parseable).
    let fechaPrometida: string | null = null;
    const fInicioStr = str(meta.fecha_inicio_estimada);
    if (fInicioStr) {
      const d = new Date(fInicioStr);
      if (Number.isFinite(d.getTime())) fechaPrometida = d.toISOString();
    }

    const descripcionProy = str(meta.descripcion) ?? str(meta.observaciones_tecnicas);

    // 7. Crear el proyecto.
    const insertProy: Record<string, unknown> = {
      empresa_id: empresaId,
      cliente_id: v.cliente_id ?? null,
      tipo_id: tipoId,
      estado_id: estadoId,
      titulo,
      descripcion: descripcionProy,
      prioridad: "normal",
      monto_vendido: Number(v.total) || 0,
      fecha_ingreso: new Date().toISOString(),
      fecha_prometida: fechaPrometida,
      brief_data,
      presupuesto_origen_id: v.id,
      presupuesto_origen_numero: v.numero_control,
    };

    const { data: nuevoProy, error: e2 } = await ctx.supabase
      .from("proyectos")
      .insert([insertProy])
      .select("id, titulo")
      .single();
    if (e2 || !nuevoProy) {
      return NextResponse.json(errorResponse(e2?.message ?? "No se pudo crear la obra"), { status: 400 });
    }
    const nuevoProyecto = nuevoProy as { id: string; titulo: string };

    // 8. Vincular el presupuesto a la obra + marcar convertido.
    const { error: e3 } = await ctx.supabase
      .from("ventas")
      .update({ proyecto_id: nuevoProyecto.id, estado_presupuesto: "convertido" })
      .eq("id", id)
      .eq("empresa_id", empresaId);
    if (e3) {
      return NextResponse.json(errorResponse(e3.message), { status: 400 });
    }

    return NextResponse.json(successResponse({ proyecto: nuevoProyecto }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
