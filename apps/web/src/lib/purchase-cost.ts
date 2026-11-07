// Quien solo recibe mercadería obtiene las compras sin costos: la API no los envía.
export const HIDDEN_COST_LABEL = "No disponible";

export function purchaseCostLabel(
  unitCostMinor: string | undefined,
  format: (minor: number) => string,
): string {
  return unitCostMinor === undefined
    ? HIDDEN_COST_LABEL
    : format(Number(unitCostMinor));
}

export function purchaseTotalLabel(
  items: { orderedQuantity: number; unitCostMinor?: string }[],
  format: (minor: number) => string,
): string {
  if (items.some(({ unitCostMinor }) => unitCostMinor === undefined))
    return HIDDEN_COST_LABEL;
  return format(
    items.reduce(
      (sum, item) => sum + item.orderedQuantity * Number(item.unitCostMinor),
      0,
    ),
  );
}
