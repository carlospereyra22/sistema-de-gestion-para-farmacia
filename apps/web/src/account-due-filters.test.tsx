import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  AccountDueFilters,
  AccountDueActiveFilters,
} from "./account-due-filters";
import { matchesDueFilters, type AccountDueRow } from "./lib/account-due-dates";

const row: AccountDueRow = {
  saleId: "sale",
  customerId: "one",
  customerName: "April",
  saleDate: null,
  dueDate: null,
  pendingMinor: "10000",
  daysOverdue: 0,
  status: "TODAY",
  reviewReason: null,
};
it("combines states as alternatives and shows everything when cleared", () => {
  expect(matchesDueFilters(row, [])).toBe(true);
  expect(matchesDueFilters(row, ["TODAY", "UNDATED"])).toBe(true);
  expect(
    matchesDueFilters({ ...row, status: "UNDATED" }, ["TODAY", "UNDATED"]),
  ).toBe(true);
  expect(
    matchesDueFilters({ ...row, status: "UPCOMING" }, ["TODAY", "UNDATED"]),
  ).toBe(false);
});
it("starts collapsed and exposes checkbox filters and clear action", () => {
  const html = renderToStaticMarkup(
    <AccountDueFilters selected={["TODAY"]} rows={[row]} onChange={() => {}} />,
  );
  expect(html).toContain("<summary");
  expect(html).not.toContain(' open=""');
  expect(html.match(/type="checkbox"/g)).toHaveLength(8);
  expect(html.match(/checked=""/g)).toHaveLength(1);
  expect(html).toContain("Limpiar filtros");
});
it("only displays removable chips for selected states", () => {
  expect(
    renderToStaticMarkup(
      <AccountDueActiveFilters selected={[]} onChange={() => {}} />,
    ),
  ).toBe("");
  const html = renderToStaticMarkup(
    <AccountDueActiveFilters
      selected={["TODAY", "UNDATED"]}
      onChange={() => {}}
    />,
  );
  expect(html).toContain("Quitar filtro: Vence hoy");
  expect(html).toContain("Quitar filtro: Sin vencimiento");
  expect(html).not.toContain("En término");
});
