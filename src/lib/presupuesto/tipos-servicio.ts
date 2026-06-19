/** Catálogo NCG de tipos de servicio. Se usa en el form del presupuesto y en
 *  el reporte de tipos de trabajo más realizados. */
export const TIPOS_SERVICIO_NCG: { value: string; label: string }[] = [
  { value: "reparacion_tejado",       label: "Reparación / mantenimiento de tejado" },
  { value: "retejado",                label: "Retejado / sustitución de tejas" },
  { value: "tejas_curvas",            label: "Tejas curvas" },
  { value: "impermeabilizacion",      label: "Impermeabilización y aislamiento" },
  { value: "sistemas_ventilados",     label: "Sistemas ventilados" },
  { value: "panel_sandwich",          label: "Paneles sándwich grecados" },
  { value: "canalones_bajantes",      label: "Canalones y bajantes" },
  { value: "ventanas_velux",          label: "Ventanas / claraboyas Velux" },
  { value: "cubiertas_ligeras",       label: "Cubiertas ligeras" },
  { value: "calculo_montaje",         label: "Cálculo y montaje de cubiertas" },
  { value: "cubiertas_gl24",          label: "Cubiertas de madera GL24" },
  { value: "accesorios_certificados", label: "Accesorios certificados" },
  { value: "otro",                    label: "Otro / no estoy seguro" },
];

export const TIPO_SERVICIO_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_SERVICIO_NCG.map((t) => [t.value, t.label])
);
