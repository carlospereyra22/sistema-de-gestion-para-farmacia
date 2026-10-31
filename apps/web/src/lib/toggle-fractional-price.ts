/** Toggle the draft without ever using the calculated fraction as a new base. */
export function toggleFractionalPrice(input: {
  enabled: boolean;
  linked: boolean;
  box: boolean;
  referenceMinor: string | null;
  price: string;
  base: string;
}): { price: string; base: string } {
  if (input.linked) {
    return {
      base: input.base,
      price:
        !input.enabled && input.box && input.referenceMinor !== null
          ? String(Number(input.referenceMinor) / 100)
          : input.price,
    };
  }
  return input.enabled
    ? { price: input.price, base: input.price }
    : { price: input.base, base: input.base };
}
