import {
  getAccountItems,
  getCustomerAccounts,
  getParties,
  getPriceLists,
} from "./api";
import { getEffectivePrices } from "./price-lists-api";
import { getAccountDueDates } from "./account-due-dates";
import { getAccountStatement } from "./account-statement";

// Con conexión se dejan guardados en la PC los clientes, sus cuentas, los
// vencimientos, el estado de cuenta y los artículos de cada cliente que debe
// (SISTEMA-70): si se corta internet se puede vender a cuenta y cobrar aunque
// nadie haya entrado antes a Cuentas corrientes. La copia la guarda la caché
// local de lecturas.

export async function precargarCuentas(
  token: string,
  organizationId: string,
  branchId: string,
  maximo = 300,
) {
  const [cuentas] = await Promise.all([
    getCustomerAccounts(token, organizationId, branchId),
    getParties(token, organizationId, "customers").catch(() => []),
    getAccountDueDates(token, organizationId, branchId).catch(() => undefined),
    getAccountStatement(token, organizationId, branchId).catch(() => undefined),
  ]);
  // Precios de cada lista: sin conexión la venta a un cliente usa la copia de
  // su lista aunque nunca se le haya vendido con conexión.
  const listas = await getPriceLists(token, organizationId).catch(() => []);
  for (const lista of listas)
    await getEffectivePrices(token, organizationId, "", lista.id).catch(
      () => undefined,
    );
  const conDeuda = cuentas
    .filter((cuenta) => !cuenta.porEnviar && cuenta.balanceMinor !== "0")
    .slice(0, maximo);
  // De a uno: no compite con lo que se está usando en pantalla.
  for (const cuenta of conDeuda)
    await getAccountItems(token, organizationId, branchId, cuenta.id).catch(
      () => undefined,
    );
}
