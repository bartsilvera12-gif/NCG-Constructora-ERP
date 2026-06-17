import ControlObraDetalleClient from "./ControlObraDetalleClient";

export default async function ControlObraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ControlObraDetalleClient projectId={id} />;
}
