"use client";

import PageHeader from "@/components/ui/PageHeader";
import { ReportCard } from "@/components/reportes/ReportCard";
import { Wallet, ShoppingCart, Package, Truck, ArrowLeftRight, TrendingUp, AlertTriangle, Hammer, BookOpen, BookText, BookMarked, Layers } from "lucide-react";

/** Hub de reportería operativa: cards estilo Configuración Global. */
export default function ReportesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="NCG · Análisis"
        title="Reportes"
        description="Panel de análisis y reportería operativa"
      />

      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
        <li>
          <ReportCard
            title="Libro de Compras"
            subtitle="Contabilidad"
            icon={BookOpen}
            description="Registro fiscal unificado de compras y gastos con desglose IVA (4/10/21%) y totales. Exportable a Excel."
            href="/reportes/libro-compras"
          />
        </li>
        <li>
          <ReportCard
            title="Libro de Ventas"
            subtitle="Contabilidad"
            icon={BookMarked}
            description="Registro fiscal de ventas: base imponible por tipo de IVA (4/10/21%), exento, IVA repercutido y totales."
            href="/reportes/libro-ventas"
          />
        </li>
        <li>
          <ReportCard
            title="Libro Diario"
            subtitle="Contabilidad"
            icon={BookText}
            description="Registro cronológico de los asientos contables generados por ventas, compras y gastos con cuentas, debe y haber."
            href="/reportes/libro-diario"
          />
        </li>
        <li>
          <ReportCard
            title="Libro Mayor"
            subtitle="Contabilidad"
            icon={Layers}
            description="Movimientos y saldos acumulados por cuenta contable, con saldo inicial, debe, haber y trazabilidad."
            href="/reportes/libro-mayor"
          />
        </li>
        <li>
          <ReportCard
            title="Rentabilidad por obra"
            subtitle="Comparativo presupuesto vs costo real"
            icon={TrendingUp}
            description="Todas las obras con presupuesto, facturado, costo real y margen %, ordenable."
            href="/reportes/rentabilidad-obras"
          />
        </li>
        <li>
          <ReportCard
            title="Tipos de trabajo"
            subtitle="Servicios más demandados"
            icon={Hammer}
            description="Ranking de tipos de obra/servicio según presupuestos y ventas, con total facturado por tipo y filtro de fechas."
            href="/reportes/tipos-trabajo"
          />
        </li>
        <li>
          <ReportCard
            title="Stock bajo"
            subtitle="Materiales por reponer"
            icon={AlertTriangle}
            description="Productos por debajo del mínimo, ordenados por urgencia, con costo de reposición."
            href="/reportes/stock-bajo"
          />
        </li>
        <li>
          <ReportCard
            title="Estado de cuenta"
            subtitle="Saldos, movimientos y situación financiera"
            icon={Wallet}
            description="Resumen de cuentas, ventas, compras, pagos y saldos del período."
            href="/reportes/estado-cuenta"
          />
        </li>
        <li>
          <ReportCard
            title="Ventas"
            subtitle="Facturación y operaciones comerciales"
            icon={ShoppingCart}
            description="Ventas del mes, tipos de precio, productos vendidos y totales."
            href="/reportes/ventas"
          />
        </li>
        <li>
          <ReportCard
            title="Compras"
            subtitle="Adquisiciones y costos"
            icon={Package}
            description="Compras del mes, proveedores, productos adquiridos y montos."
            href="/reportes/compras"
          />
        </li>
        <li>
          <ReportCard
            title="Proveedores"
            subtitle="Abastecimiento y relación comercial"
            icon={Truck}
            description="Resumen de proveedores, compras por proveedor y actividad del mes."
            href="/reportes/proveedores"
          />
        </li>
        <li>
          <ReportCard
            title="Conciliación entre cuentas"
            subtitle="Transferencias y tarjetas"
            icon={ArrowLeftRight}
            description="Cobros por transferencia y tarjeta: banco, titular, monto y comprobante del período."
            href="/reportes/conciliacion"
          />
        </li>
      </ul>
    </div>
  );
}
