import { typedCostMinor } from "./lot-cost";

export function stockAdjustmentDelta(
  value: string,
  direction: "subtract" | "add",
): number {
  const quantity = Number(value);
  if (!value.trim() || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error(
      "Ingresá una cantidad entera mayor que 0 y elegí Restar o Sumar. La cantidad indica las unidades que querés quitar o agregar, no el stock final.",
    );
  }
  return direction === "subtract" ? -quantity : quantity;
}

export type AdjustmentCostMode = "none" | "last" | "other";

// Costo que acompaña al ajuste. Restar no agrega unidades, así que no lleva.
export function stockAdjustmentCost(
  mode: AdjustmentCostMode,
  direction: "subtract" | "add",
  lastCostMinor: string | undefined,
  typed: string,
): number | undefined {
  if (direction === "subtract" || mode === "none") return undefined;
  return Number(mode === "last" ? lastCostMinor : typedCostMinor(typed));
}
