/**
 * Quita los costos de una compra ya serializada, a cualquier profundidad. Recorrer todo
 * evita filtrar un costo si mañana aparece en otro nivel de la respuesta.
 */
export function hidePurchaseCosts<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, item: unknown) =>
      key === "unitCostMinor" ? undefined : item,
    ),
  ) as T;
}
