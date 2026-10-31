import { expect, it } from "vitest";
import { filterPendingSales } from "./filter-pending-sales";

it("matches the displayed sale number or full id, ignoring case and edge spaces", () => {
  const sales = [{ saleId: "bd2168cb-123" }, { saleId: "08f04f17-456" }];
  expect(filterPendingSales(sales, " BD2168CB ")).toEqual([sales[0]]);
  expect(filterPendingSales(sales, "08f04f17-456")).toEqual([sales[1]]);
  expect(filterPendingSales(sales, "missing")).toEqual([]);
  expect(filterPendingSales(sales, " ")).toBe(sales);
  expect(sales).toHaveLength(2);
});
