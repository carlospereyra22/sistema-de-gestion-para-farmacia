import { expect, it } from "vitest";
import {
  effectiveSalePriceListId,
  salePriceListOptions,
} from "./price-list-selection";

const lists = [
  { id: "general", name: "Precio general" },
  { id: "mayorista", name: "Mayorista" },
];

it("sin cliente ni elección usa Precio general", () => {
  expect(effectiveSalePriceListId(lists, "")).toBe("general");
});
it("un cliente sin lista asociada usa Precio general", () => {
  expect(effectiveSalePriceListId(lists, "", null)).toBe("general");
});
it("un cliente con lista asociada la pone sola", () => {
  expect(effectiveSalePriceListId(lists, "", "mayorista")).toBe("mayorista");
});
it("la lista elegida en la venta manda sobre la del cliente", () => {
  expect(effectiveSalePriceListId(lists, "general", "mayorista")).toBe(
    "general",
  );
});
it("ofrece solo listas reales, sin Según cliente", () => {
  expect(salePriceListOptions(lists, "general")).toEqual([
    { value: "general", label: "Precio general" },
    { value: "mayorista", label: "Mayorista" },
  ]);
});
it("muestra la lista asignada aunque no venga en el listado", () => {
  expect(salePriceListOptions(lists, "vieja").at(-1)).toEqual({
    value: "vieja",
    label: "Lista asignada",
  });
});
