import { expect, it } from "vitest";
import {
  emptyCatalogAdditionalFilters,
  matchesCatalogAdditionalFilters,
} from "./catalog-additional-filters";
const plain = {
  image: null,
  barcodes: [],
  externalReferenceSource: null,
  externalReferenceName: null,
};
const complete = {
  image: { updatedAt: "2026-10-23" },
  barcodes: [{ code: "779" }],
  externalReferenceSource: "official" as const,
  externalReferenceName: "Actron",
};
it("filters brand independently of the laboratory and explicit medication type", () => {
  const product = { ...plain, brand: "Dermaglós", isMedication: false };
  expect(
    matchesCatalogAdditionalFilters(product, {
      ...emptyCatalogAdditionalFilters,
      brand: "DERMAGLÓS",
      kind: "other",
    }),
  ).toBe(true);
  expect(
    matchesCatalogAdditionalFilters(product, {
      ...emptyCatalogAdditionalFilters,
      kind: "medicine",
    }),
  ).toBe(false);
  expect(
    matchesCatalogAdditionalFilters(product, {
      ...emptyCatalogAdditionalFilters,
      brand: "Algabo",
    }),
  ).toBe(false);
});
it("does not exclude products when no additional filters are selected", () => {
  expect(
    matchesCatalogAdditionalFilters(plain, emptyCatalogAdditionalFilters),
  ).toBe(true);
  expect(
    matchesCatalogAdditionalFilters(complete, emptyCatalogAdditionalFilters),
  ).toBe(true);
});
it("combines photo, barcode and price reference filters", () => {
  const filters = { image: "with", barcode: "with", reference: "linked" };
  expect(matchesCatalogAdditionalFilters(complete, filters)).toBe(true);
  expect(matchesCatalogAdditionalFilters(plain, filters)).toBe(false);
  expect(
    matchesCatalogAdditionalFilters({ ...complete, image: null }, filters),
  ).toBe(false);
  expect(
    matchesCatalogAdditionalFilters({ ...complete, barcodes: [] }, filters),
  ).toBe(false);
  expect(
    matchesCatalogAdditionalFilters(
      { ...complete, externalReferenceName: null },
      filters,
    ),
  ).toBe(false);
  expect(
    matchesCatalogAdditionalFilters(plain, {
      image: "without",
      barcode: "without",
      reference: "unlinked",
    }),
  ).toBe(true);
});
