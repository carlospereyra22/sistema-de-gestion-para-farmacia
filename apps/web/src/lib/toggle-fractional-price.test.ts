import { expect, it } from "vitest";
import { toggleFractionalPrice } from "./toggle-fractional-price";
import { fractionalPricePreview } from "./fractional-price-preview";
import { parsePrice } from "./price-lists-api";

it("keeps a 10000 pack at 5000 per fraction over repeated toggles", () => {
  let draft = { price: "10000", base: "" };
  for (let cycle = 0; cycle < 5; cycle++) {
    draft = toggleFractionalPrice({
      ...draft,
      enabled: true,
      linked: false,
      box: true,
      referenceMinor: null,
    });
    expect(fractionalPricePreview(parsePrice(draft.base), "2", "0")).toBe(
      "500000",
    );
    draft = toggleFractionalPrice({
      ...draft,
      enabled: false,
      linked: false,
      box: true,
      referenceMinor: null,
    });
    expect(draft).toEqual({ price: "10000", base: "10000" });
  }
});

it("restores the separate base of a previously saved fraction", () => {
  const draft = toggleFractionalPrice({
    price: "5500",
    base: "10000",
    enabled: false,
    linked: false,
    box: true,
    referenceMinor: null,
  });
  expect(draft.price).toBe("10000");
  const enabled = toggleFractionalPrice({
    ...draft,
    enabled: true,
    linked: false,
    box: true,
    referenceMinor: null,
  });
  expect(fractionalPricePreview(parsePrice(enabled.base), "2", "10")).toBe(
    "550000",
  );
});

it("uses an explicitly edited non-fractional price on the next activation", () => {
  const draft = toggleFractionalPrice({
    price: "12000",
    base: "10000",
    enabled: true,
    linked: false,
    box: true,
    referenceMinor: null,
  });
  expect(draft.base).toBe("12000");
});

it("restores the linked pack reference without inventing a zero for a missing reference", () => {
  const input = {
    price: "5000",
    base: "10000",
    enabled: false,
    linked: true,
    box: true,
    referenceMinor: "1200000",
  };
  expect(toggleFractionalPrice(input).price).toBe("12000");
  expect(toggleFractionalPrice({ ...input, referenceMinor: null }).price).toBe(
    "5000",
  );
  expect(toggleFractionalPrice({ ...input, box: false }).price).toBe("5000");
});
