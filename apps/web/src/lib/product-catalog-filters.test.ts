import { expect, it } from "vitest";
import { matchesCatalogExtras } from "./product-catalog-filters";
const product = {
  id: "a",
  name: "Medicación",
  barcodes: [{ code: "779123", isPrimary: true }],
  laboratory: { id: "lab", name: "Laboratorio Sur" },
  externalReferenceSource: null,
  externalReferenceName: null,
};
const lots = [
  {
    productId: "a",
    quantity: 2,
    expiresAt: "2026-10-01",
    expiryStatus: "EXPIRED" as const,
  },
  {
    productId: "a",
    quantity: 3,
    expiresAt: "2026-11-01",
    expiryStatus: "EXPIRING_SOON" as const,
  },
];
it("searches names, barcodes and laboratories without accent sensitivity", () => {
  for (const query of ["medicacion", "779123", "laboratorio sur"])
    expect(matchesCatalogExtras(product, lots, query, "", "")).toBe(true);
  expect(matchesCatalogExtras(product, lots, "otro", "", "")).toBe(false);
});
it("combines expiry and reference filters without treating expired stock as upcoming", () => {
  expect(matchesCatalogExtras(product, lots, "", "expired", "unlinked")).toBe(
    true,
  );
  expect(matchesCatalogExtras(product, lots, "", "expiring", "linked")).toBe(
    false,
  );
  expect(
    matchesCatalogExtras(product, lots.slice(0, 1), "", "expiring", ""),
  ).toBe(false);
  expect(
    matchesCatalogExtras(
      product,
      lots.map((l) => ({ ...l, quantity: 0 })),
      "",
      "expired",
      "",
    ),
  ).toBe(false);
  expect(
    matchesCatalogExtras(
      product,
      [
        {
          productId: "a",
          quantity: 2,
          expiresAt: null,
          expiryStatus: "AVAILABLE",
        },
      ],
      "",
      "undated",
      "",
    ),
  ).toBe(true);
});
