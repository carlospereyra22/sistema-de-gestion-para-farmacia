import { expect, it } from "vitest";
import { dashboardInventoryBars } from "./dashboard-inventory-bars";
it("bounds the detail to five groups with more than eight categories without losing totals", () => {
  const products = Array.from({ length: 12 }, (_, category) =>
    Array.from({ length: category + 1 }, (_, product) => ({
      id: `${category}-${product}`,
      category: { name: `Categoría ${category}` },
    })),
  ).flat();
  const { missing } = dashboardInventoryBars(products, []);
  expect(missing).toHaveLength(5);
  expect(missing.slice(0, 4).map((row) => row.value)).toEqual([12, 11, 10, 9]);
  expect(missing[4]).toEqual({ label: "Otras categorías", value: 36 });
  expect(missing.reduce((sum, row) => sum + row.value, 0)).toBe(
    products.length,
  );
});
it("uses actual missing categories and expiry ranges, not fabricated history", () => {
  const now = new Date("2026-10-14T12:00:00Z").getTime();
  const data = dashboardInventoryBars(
    [
      { id: "a", category: { name: "Medicación" } },
      { id: "b", category: null },
      { id: "c", category: null },
    ],
    [
      {
        productId: "c",
        expiresAt: new Date(now + 10 * 86400000).toISOString(),
      },
      { productId: "c", expiresAt: new Date(now - 86400000).toISOString() },
    ],
    now,
  );
  expect(data.missing.reduce((sum, row) => sum + row.value, 0)).toBe(2);
  expect(data.expiry.map((row) => row.value)).toEqual([1, 0, 1, 0, 0]);
  expect(dashboardInventoryBars([], [], now).missing[0]?.value).toBe(0);
});
