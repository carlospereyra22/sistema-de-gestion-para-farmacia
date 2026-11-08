import { getParties, getPurchases, getReceiptLots } from "./api";
import { purchaseRequest } from "./purchases";

// Con conexión se dejan guardados en la PC los pedidos abiertos y sus
// detalles (SISTEMA-69): si se corta internet se pueden recibir aunque nadie
// haya entrado antes a Compras. La copia la guarda la caché local de lecturas.

const ABIERTOS = new Set(["ORDERED", "PARTIALLY_RECEIVED"]);

export async function precargarCompras(
  token: string,
  organizationId: string,
  branchId: string,
  maximo = 60,
) {
  const [compras] = await Promise.all([
    getPurchases(token, organizationId, branchId),
    getParties(token, organizationId, "suppliers").catch(() => []),
    // Lotes de la sucursal: así la recepción reconoce los que ya existen.
    getReceiptLots(token, organizationId, branchId).catch(() => []),
  ]);
  const abiertos = compras
    .filter((compra) => ABIERTOS.has(compra.status))
    .slice(0, maximo);
  // De a uno: no compite con lo que se está usando en pantalla.
  for (const compra of abiertos)
    await purchaseRequest(
      token,
      organizationId,
      branchId,
      `/${compra.id}`,
    ).catch(() => undefined);
}
