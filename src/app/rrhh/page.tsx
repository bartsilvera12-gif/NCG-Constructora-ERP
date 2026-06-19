import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

type Seccion = { titulo: string; descripcion: string; href?: string };

const SECCIONES: Seccion[] = [
  { titulo: "Empleados", descripcion: "Alta de personal, cargos, salarios, tipo(s) de empleado y datos de chofer.", href: "/rrhh/empleados" },
  { titulo: "Personal por obra", descripcion: "Listado consolidado: por obra (con sus empleados) y por empleado (en qué obras está).", href: "/reportes/personal-por-obra" },
  { titulo: "Control horario", descripcion: "Fichajes de entrada y salida diarios. Calcula horas automáticamente.", href: "/rrhh/control-horario" },
  { titulo: "Vacaciones", descripcion: "Solicitudes y aprobación de vacaciones por empleado.", href: "/rrhh/vacaciones" },
  { titulo: "Nómina", descripcion: "Liquidación mensual: salario base + costo de horas en obras del mes.", href: "/rrhh/nomina" },
];

export default function RrhhPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="NCG · Personal"
        title="Recursos Humanos"
        description="Gestión de empleados y asignación de mano de obra a obras."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SECCIONES.map((s) => {
          const card = (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#4FAEB2]/40 hover:shadow">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">{s.titulo}</h3>
                {s.href ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Disponible
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Próximamente
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.descripcion}</p>
            </div>
          );
          return s.href ? (
            <Link key={s.titulo} href={s.href} className="block">{card}</Link>
          ) : (
            <div key={s.titulo}>{card}</div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">
        El costo por hora del empleado se usa para imputar mano de obra a cada obra y se suma
        automáticamente al costo real (visible en el tab Rentabilidad de la obra).
      </p>
    </div>
  );
}
