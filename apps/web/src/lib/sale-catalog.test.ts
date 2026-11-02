import { describe, expect, it } from "vitest";
import {
  filterSaleCatalog,
  nextSaleCatalogSelection,
  saleCatalogDetail,
  saleCategoryOptions,
} from "./sale-catalog";

const product = (
  id: string,
  name: string,
  extra: Partial<Parameters<typeof saleCatalogDetail>[0]> = {},
) => ({
  id,
  name,
  activeIngredient: null,
  concentration: null,
  pharmaceuticalForm: null,
  presentation: null,
  barcodes: [],
  category: null,
  ...extra,
});
const gastro = { id: "c1", name: "Gastro" };
const products = [
  product("p1", "Omeprazol 20 mg", {
    activeIngredient: "Omeprazol",
    pharmaceuticalForm: "Cápsulas",
    barcodes: [{ code: "7790001" }],
    category: gastro,
  }),
  product("p2", "Ibuprofeno 400 mg", {
    activeIngredient: "Ibuprofeno",
    category: { id: "c2", name: "Analgésicos" },
  }),
  product("p3", "Alcohol en gel"),
];
const stock = (id: string) =>
  id === "p2" ? { available: 0, expired: 16 } : { available: 4, expired: 0 };
const none = { query: "", categoryId: "", inStockOnly: false };

describe("sale catalog", () => {
  it("shows the whole catalog, including products without stock", () => {
    expect(filterSaleCatalog(products, stock, none).map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });
  it("searches by name, active ingredient or barcode", () => {
    const ids = (query: string) =>
      filterSaleCatalog(products, stock, { ...none, query }).map((p) => p.id);
    expect(ids("alcohol")).toEqual(["p3"]);
    expect(ids("IBUPRO")).toEqual(["p2"]);
    expect(ids("7790001")).toEqual(["p1"]);
  });
  it("filters by category and sellable stock", () => {
    expect(
      filterSaleCatalog(products, stock, { ...none, categoryId: "c1" }),
    ).toHaveLength(1);
    expect(
      filterSaleCatalog(products, stock, { ...none, inStockOnly: true }).map(
        (p) => p.id,
      ),
    ).toEqual(["p1", "p3"]);
  });
  it("describes pharmaceutical detail", () => {
    expect(saleCatalogDetail(products[0]!)).toBe("Omeprazol · Cápsulas");
    expect(saleCatalogDetail(products[2]!)).toBe("");
  });
  it("lists each category once, sorted, after Todas", () => {
    expect(saleCategoryOptions([...products, products[0]!])).toEqual([
      { value: "", label: "Todas las categorías" },
      { value: "c2", label: "Analgésicos" },
      { value: "c1", label: "Gastro" },
    ]);
  });
  it("moves the selection within bounds", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(nextSaleCatalogSelection(rows, undefined, 1)).toBe("a");
    expect(nextSaleCatalogSelection(rows, undefined, -1)).toBe("c");
    expect(nextSaleCatalogSelection(rows, "a", 1)).toBe("b");
    expect(nextSaleCatalogSelection(rows, "c", 1)).toBe("c");
    expect(nextSaleCatalogSelection(rows, "a", -1)).toBe("a");
    expect(nextSaleCatalogSelection([], "a", 1)).toBeUndefined();
  });
});
