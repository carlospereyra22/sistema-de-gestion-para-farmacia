import { afterEach, expect, it, vi } from "vitest";
import { createPriceList, createSale } from "./api";
import {
  getEffectivePrices,
  saveListChanges,
  parsePriceAdjustment,
  parsePrice,
  previewListIncrease,
} from "./price-lists-api";
import { preservePriceListSelection } from "./price-list-selection";
afterEach(() => vi.unstubAllGlobals());
it("parses signed adjustments without allowing negative product prices", () => {
  expect(parsePriceAdjustment("-5")).toBe(-500);
  expect(parsePriceAdjustment("-500")).toBe(-50000);
  expect(parsePriceAdjustment("+2,25")).toBe(225);
  expect(parsePriceAdjustment("0")).toBe(0);
  for (const value of ["", "-", "--5", "1e3", "5.123"])
    expect(parsePriceAdjustment(value)).toBeNull();
  expect(parsePrice("-5")).toBeNull();
});
it("sends a negative percentage to the server preview", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fetchMock);
  await previewListIncrease("token", "org", "list", ["p"], "PERCENT", -500);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/list/preview"),
    expect.objectContaining({
      body: JSON.stringify({ productIds: ["p"], mode: "PERCENT", value: -500 }),
    }),
  );
});
it("preserves a custom list when refreshing authentication and list data", () => {
  const lists = [
    { id: "general", name: "Precio general" },
    { id: "custom", name: "Convenios" },
  ];
  expect(preservePriceListSelection(lists, "custom")).toBe("custom");
  expect(preservePriceListSelection(lists, "")).toBe("general");
});
it.each([false, true])(
  "creates the chosen list type and returns its exact identifier (%s)",
  async (includeAll) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "created" }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await createPriceList("token", "org", "Convenios", includeAll),
    ).toEqual({ id: "created" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/price-lists"),
      expect.objectContaining({
        body: JSON.stringify({ name: "Convenios", includeAll }),
      }),
    );
  },
);
it("uses the same explicit list when quoting prices and confirming a sale", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  await getEffectivePrices("token", "org", "customer", "custom");
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining("customerId=customer&priceListId=custom"),
    expect.any(Object),
  );
  await createSale("token", "org", "branch", {
    priceListId: "custom",
    items: [{ productId: "p", quantity: 1, expectedUnitPriceMinor: "100" }],
    payments: [{ method: "TRANSFER", amountMinor: 100 }],
  });
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({
    priceListId: "custom",
    items: [{ expectedUnitPriceMinor: "100" }],
  });
});
it("preserves server conflict feedback instead of treating a failed save as success", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Los precios cambiaron." }),
    }),
  );
  await expect(
    saveListChanges("token", "org", "custom", "request", []),
  ).rejects.toThrow("Los precios cambiaron.");
});
