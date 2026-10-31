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
