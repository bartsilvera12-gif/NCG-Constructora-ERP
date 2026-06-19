-- Agrega columna `provincia` a clientes para el encabezado del PDF (lado
-- derecho) y para que el alta de cliente al aprobar el presupuesto la guarde.

ALTER TABLE ncgconstructora.clientes
  ADD COLUMN IF NOT EXISTS provincia text;
