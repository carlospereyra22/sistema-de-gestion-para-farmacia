import { expect, it } from "vitest";
import { defaultPriceListTitle } from "./default-price-list-title";

it("defaults to Lista followed by the current month and year in Spanish", () => {
  expect(defaultPriceListTitle(new Date("2026-09-26T12:00:00Z"))).toBe(
    "Lista septiembre 2026",
  );
});

it("changes month and year at midnight in Argentina", () => {
  expect(defaultPriceListTitle(new Date("2027-01-01T02:59:59Z"))).toBe(
    "Lista diciembre 2026",
  );
  expect(defaultPriceListTitle(new Date("2027-01-01T03:00:00Z"))).toBe(
    "Lista enero 2027",
  );
});
