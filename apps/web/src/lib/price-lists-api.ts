import { apiFetch as fetch, SinConexionError } from "./api-fetch";
import {
  bandejaDeLaPc,
  getCatalogProducts,
  getPriceLists,
  guardarCambioDeLista,
  listaEnEspera,
  type CatalogProduct,
} from "./api";
import {
  precioAjustado,
  preciosPendientesDeLista,
} from "./catalogo-sin-conexion";
const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
export type PriceChange = {
  productId: string;
  expectedMinor: string | null;
  amountMinor: string | null;
};
export type EffectivePrices = {
  listName: string;
  prices: { productId: string; amountMinor: string | null; source: string }[];
};
async function request<T>(
  token: string,
  organizationId: string,
  path: string,
  data?: unknown,
  method?: "PATCH",
): Promise<T> {
  const response = await fetch(
    `${base}/organizations/${organizationId}/catalog/${path}`,
    {
      method: method ?? (data === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "No se pudo actualizar la lista.",
    );
  return result as T;
}
const preciosDe = (
  token: string,
  org: string,
  customerId: string,
  priceListId: string,
) =>
  request<EffectivePrices>(
    token,
    org,
    `effective-prices?${new URLSearchParams({ ...(customerId ? { customerId } : {}), ...(priceListId ? { priceListId } : {}) })}`,
  );
/**
 * Precios con los que se cobra. La lista es la elegida, la del cliente o
 * Precio general: el cliente no cambia los precios. Sin conexión, si esa
 * combinación de cliente y lista nunca se consultó, se usa la copia de la
 * misma lista sin cliente (`listaEnUso`), que la PC guarda para todas las
 * listas (SISTEMA-70).
 */
export async function getEffectivePrices(
  token: string,
  org: string,
  customerId: string,
  priceListId = "",
  listaEnUso = "",
) {
  const lista = priceListId || listaEnUso;
  let precios: EffectivePrices;
  try {
    precios = await preciosDe(token, org, customerId, priceListId);
  } catch (cause) {
    if (!(cause instanceof SinConexionError) || (!customerId && !lista))
      throw cause;
    precios = await preciosDe(token, org, "", lista);
  }
  // Precios de la lista cambiados en la PC que todavía no llegaron (SISTEMA-80).
  const cambiados = lista
    ? preciosPendientesDeLista(await bandejaDeLaPc(), org, lista)
    : new Map<string, string | null>();
  if (!cambiados.size) return precios;
  return {
    ...precios,
    prices: precios.prices.map((p) =>
      cambiados.has(p.productId) && cambiados.get(p.productId) !== null
        ? {
            ...p,
            amountMinor: cambiados.get(p.productId)!,
            source: precios.listName,
          }
        : p,
    ),
  };
}
/**
 * Con conexión, `enLinea`; sin conexión (o si la lista tiene algo sin
 * enviar, para llegar en orden), el cambio queda en la PC (SISTEMA-80).
 */
async function listaConRespaldo<T>(
  org: string,
  listId: string,
  branchId: string | undefined,
  enLinea: () => Promise<T>,
  enLaPc: (branchId: string) => Promise<T>,
): Promise<T> {
  if (!branchId) return enLinea();
  if (!(await listaEnEspera(org, listId)))
    try {
      return await enLinea();
    } catch (cause) {
      if (!(cause instanceof SinConexionError)) throw cause;
    }
  return enLaPc(branchId);
}
export const saveListChanges = (
  token: string,
  org: string,
  listId: string,
  requestId: string,
  changes: PriceChange[],
  branchId?: string,
) =>
  listaConRespaldo(
    org,
    listId,
    branchId,
    () =>
      request(token, org, `price-lists/${listId}/changes`, {
        requestId,
        changes,
      }),
    (sucursal) =>
      guardarCambioDeLista(token, org, sucursal, {
        tipo: "LISTA_PRECIOS",
        cuerpo: { priceListId: listId, changes },
      }),
  );
export const renamePriceList = (
  token: string,
  org: string,
  listId: string,
  name: string,
  fallbackPriceListId?: string | null,
  branchId?: string,
) =>
  listaConRespaldo(
    org,
    listId,
    branchId,
    () =>
      request(
        token,
        org,
        `price-lists/${listId}`,
        { name, fallbackPriceListId },
        "PATCH",
      ),
    (sucursal) =>
      guardarCambioDeLista(token, org, sucursal, {
        tipo: "LISTA_EDICION",
        cuerpo: {
          priceListId: listId,
          name: name.trim(),
          ...(fallbackPriceListId !== undefined ? { fallbackPriceListId } : {}),
        },
      }),
  );
export const previewListIncrease = async (
  token: string,
  org: string,
  listId: string,
  productIds: string[],
  mode: "PERCENT" | "FIXED",
  value: number,
): Promise<(PriceChange & { name: string })[]> => {
  try {
    if (!(await listaEnEspera(org, listId)))
      return await request<(PriceChange & { name: string })[]>(
        token,
        org,
        `price-lists/${listId}/preview`,
        { productIds, mode, value },
      );
  } catch (cause) {
    if (!(cause instanceof SinConexionError)) throw cause;
  }
  // Sin conexión (o con cambios sin enviar): con los precios que ve la PC,
  // igual que en el servidor (SISTEMA-80).
  const [listas, catalogo] = await Promise.all([
    getPriceLists(token, org),
    getCatalogProducts(token, org).catch(() => [] as CatalogProduct[]),
  ]);
  const precios = new Map(
    (listas.find((l) => l.id === listId)?.prices ?? []).map((p) => [
      p.productId,
      p.amountMinor,
    ]),
  );
  if (productIds.some((id) => !precios.has(id)))
    throw new Error(
      "La selección incluye productos que no están en esta lista. Actualizá la selección.",
    );
  const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
  return productIds.map((productId) => ({
    productId,
    name: nombres.get(productId) ?? "Producto",
    expectedMinor: precios.get(productId)!,
    amountMinor: precioAjustado(
      BigInt(precios.get(productId)!),
      mode,
      value,
    ).toString(),
  }));
};

export function parsePrice(value: string): string | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", decimal = ""] = normalized.split(".");
  const result = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
  return result <= 999999999999n ? result.toString() : null;
}

export function parsePriceAdjustment(value: string): number | null {
  const text = value.trim();
  const amount = parsePrice(text.replace(/^[+-]/, ""));
  return amount === null
    ? null
    : Number(amount) * (text.startsWith("-") ? -1 : 1);
}
