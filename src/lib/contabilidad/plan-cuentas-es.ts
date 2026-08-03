/**
 * Plan de cuentas base para España (PGC PYMEs simplificado).
 * Se puede sembrar por empresa desde /api/contabilidad/seed-plan-cuentas.
 */

export type CuentaSeed = {
  codigo: string;
  nombre: string;
  tipo: "activo" | "pasivo" | "patrimonio" | "ingreso" | "gasto" | "orden";
};

export const PLAN_CUENTAS_ES: CuentaSeed[] = [
  // Grupo 4 · Acreedores y deudores
  { codigo: "400", nombre: "Proveedores",                        tipo: "pasivo" },
  { codigo: "410", nombre: "Acreedores por prestación de servicios", tipo: "pasivo" },
  { codigo: "430", nombre: "Clientes",                            tipo: "activo" },
  { codigo: "472", nombre: "H.P. IVA soportado",                  tipo: "activo" },
  { codigo: "4720", nombre: "IVA soportado 4%",                   tipo: "activo" },
  { codigo: "4721", nombre: "IVA soportado 10%",                  tipo: "activo" },
  { codigo: "4722", nombre: "IVA soportado 21%",                  tipo: "activo" },
  { codigo: "473", nombre: "H.P. retenciones y pagos a cuenta",   tipo: "activo" },
  { codigo: "475", nombre: "H.P. acreedora por conceptos fiscales", tipo: "pasivo" },
  { codigo: "4751", nombre: "H.P. acreedora por IRPF",            tipo: "pasivo" },
  { codigo: "477", nombre: "H.P. IVA repercutido",                tipo: "pasivo" },
  { codigo: "4770", nombre: "IVA repercutido 4%",                 tipo: "pasivo" },
  { codigo: "4771", nombre: "IVA repercutido 10%",                tipo: "pasivo" },
  { codigo: "4772", nombre: "IVA repercutido 21%",                tipo: "pasivo" },

  // Grupo 5 · Tesorería
  { codigo: "570", nombre: "Caja euros",                          tipo: "activo" },
  { codigo: "572", nombre: "Bancos c/c",                          tipo: "activo" },

  // Grupo 6 · Compras y gastos
  { codigo: "600", nombre: "Compras de mercaderías",              tipo: "gasto" },
  { codigo: "601", nombre: "Compras de materias primas",          tipo: "gasto" },
  { codigo: "602", nombre: "Compras de otros aprovisionamientos", tipo: "gasto" },
  { codigo: "621", nombre: "Arrendamientos y cánones",            tipo: "gasto" },
  { codigo: "622", nombre: "Reparaciones y conservación",         tipo: "gasto" },
  { codigo: "623", nombre: "Servicios de profesionales independientes", tipo: "gasto" },
  { codigo: "624", nombre: "Transportes",                         tipo: "gasto" },
  { codigo: "625", nombre: "Primas de seguros",                   tipo: "gasto" },
  { codigo: "626", nombre: "Servicios bancarios y similares",     tipo: "gasto" },
  { codigo: "627", nombre: "Publicidad, propaganda y RR.PP.",     tipo: "gasto" },
  { codigo: "628", nombre: "Suministros",                         tipo: "gasto" },
  { codigo: "629", nombre: "Otros servicios",                     tipo: "gasto" },
  { codigo: "640", nombre: "Sueldos y salarios",                  tipo: "gasto" },
  { codigo: "642", nombre: "Seguridad Social a cargo empresa",    tipo: "gasto" },

  // Grupo 7 · Ventas e ingresos
  { codigo: "700", nombre: "Ventas de mercaderías",               tipo: "ingreso" },
  { codigo: "705", nombre: "Prestaciones de servicios",           tipo: "ingreso" },
  { codigo: "706", nombre: "Ventas de obra ejecutada",            tipo: "ingreso" },
];

/**
 * Config default: qué cuenta usar para cada operación. Se puede editar luego
 * desde /configuracion/contable.
 */
export const CONFIG_DEFAULT_CODIGOS = {
  cuenta_clientes:               "430",
  cuenta_proveedores:            "400",
  cuenta_ventas:                 "706",
  cuenta_compras:                "600",
  cuenta_gastos:                 "629",
  cuenta_iva_repercutido_21:     "4772",
  cuenta_iva_repercutido_10:     "4771",
  cuenta_iva_repercutido_4:      "4770",
  cuenta_iva_soportado_21:       "4722",
  cuenta_iva_soportado_10:       "4721",
  cuenta_iva_soportado_4:        "4720",
  cuenta_irpf:                   "4751",
  cuenta_caja:                   "570",
  cuenta_banco:                  "572",
} as const;
