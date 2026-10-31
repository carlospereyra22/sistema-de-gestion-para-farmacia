import { describe, expect, it } from "vitest";
import { filterHistory } from "./filter-operation-history";
const rows = [
  {
    id: "one",
    date: "2026-09-13T01:00:00Z",
    title: "Recepción Actron",
    status: "PURCHASE_RECEIPT",
    detail: ["Lote 123"],
  },
  {
    id: "two",
    date: "2026-09-13T15:00:00Z",
    title: "Actron",
    status: "ADJUSTMENT_OUT",
    detail: ["Lote 456"],
  },
];
describe("operation history filters", () => {
  it("uses Argentina calendar dates including the end date", () => {
    expect(
      filterHistory(rows, "", "", "2026-09-12", "2026-09-12").map(
        (row) => row.id,
      ),
    ).toEqual(["one"]);
  });
  it("combines accent-insensitive search and operation type", () => {
    expect(
      filterHistory(rows, "recepcion", "PURCHASE_RECEIPT", "", ""),
    ).toHaveLength(1);
    expect(
      filterHistory(rows, "456", "ADJUSTMENT_OUT", "", "").map((row) => row.id),
    ).toEqual(["two"]);
    expect(filterHistory(rows, "456", "PURCHASE_RECEIPT", "", "")).toHaveLength(
      0,
    );
  });
});
