"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import GastoForm from "@/components/gastos/GastoForm";
import PageHeader from "@/components/ui/PageHeader";

function NuevoGastoInner() {
  const sp = useSearchParams();
  const proyectoId = sp?.get("proyecto_id") ?? null;
  const returnTo = sp?.get("return_to") ?? null;
  const backHref = returnTo && returnTo.startsWith("/") ? returnTo : "/gastos";
  const backLabel = returnTo ? "Volver" : "Gastos";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="NCG · Egresos"
        title="Nuevo gasto"
        description={
          proyectoId
            ? "Registrar un gasto operativo para esta obra"
            : "Registrar un gasto operativo"
        }
        backHref={backHref}
        backLabel={backLabel}
      />

      <GastoForm proyectoId={proyectoId} returnTo={returnTo} />
    </div>
  );
}

export default function NuevoGastoPage() {
  return (
    <Suspense fallback={null}>
      <NuevoGastoInner />
    </Suspense>
  );
}
