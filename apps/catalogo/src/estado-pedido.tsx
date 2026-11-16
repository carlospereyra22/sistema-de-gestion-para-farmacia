import type { EstadoPedido } from "./lib/api";
import { CLASES_TONO, ESTADOS_PEDIDO } from "./lib/carrito";

/** Etiqueta del estado de un pedido, como lo ve el cliente. */
export function EstadoPedidoEtiqueta({ estado }: { estado: EstadoPedido }) {
  const datos = ESTADOS_PEDIDO[estado];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASES_TONO[datos.tono]}`}
    >
      {datos.cliente}
    </span>
  );
}
