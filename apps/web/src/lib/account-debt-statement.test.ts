import { expect, it } from "vitest";
import {
  argentinaSaleDate,
  debtStatementHtml,
  statementMoney,
  statementRows,
} from "./account-debt-statement";
import type { AccountDueRow } from "./account-due-dates";
const row: AccountDueRow = {
  saleId: "sale-one",
  customerId: "client",
  customerName: "Carlos",
  saleDate: "2026-10-10T02:30:00Z",
  dueDate: null,
  pendingMinor: "10001",
  daysOverdue: 0,
  status: "UNDATED",
  reviewReason: null,
};
it("uses Argentina sale dates and inclusive bounds, independently of due date", () => {
  expect(argentinaSaleDate(row.saleDate)).toBe("2026-10-09");
  expect(
    statementRows([row], {
      customerId: "",
      from: "2026-10-09",
      to: "2026-10-09",
    }).rows,
  ).toHaveLength(1);
  expect(
    statementRows([row], { customerId: "", from: "2026-10-10", to: "" }).rows,
  ).toHaveLength(0);
  expect(
    statementRows([row], { customerId: "other", from: "", to: "" }).rows,
  ).toHaveLength(0);
});
it("includes undated sales without a range and warns when they cannot be placed in a range", () => {
  const unknown = { ...row, saleDate: null };
  expect(
    statementRows([unknown], { customerId: "", from: "", to: "" }).rows,
  ).toHaveLength(1);
  const filtered = statementRows([unknown], {
    customerId: "",
    from: "2026-01-01",
    to: "",
  });
  expect(filtered.rows).toHaveLength(0);
  expect(filtered.unknownDates).toBe(1);
});
it("prints A4 with escaped content and excludes uncertain amounts from totals", () => {
  const review: AccountDueRow = {
    ...row,
    saleId: "review",
    status: "REVIEW",
    pendingMinor: "90000",
    reviewReason: "<script>alert(1)</script>",
  };
  const html = debtStatementHtml({
    rows: [{ ...row, customerName: "<img src=x onerror=alert(1)>" }, review],
    filter: { customerId: "", from: "", to: "" },
    organization: "A&B",
    branch: "Central",
    customerLabel: "Todos",
    generatedAt: "2026-10-12T15:00:00Z",
    unknownDates: 0,
    identities: { client: "<b>DNI</b>" },
  });
  expect(html).toContain("size:A4 portrait");
  expect(html).toContain("table-header-group");
  expect(html).toContain("Total confirmado (parcial)");
  expect(html).toContain("$ 100,01");
  expect(html).not.toContain("$ 1.000,01");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("A&amp;B");
  expect(html).toContain("&lt;b&gt;DNI&lt;/b&gt;");
  expect(html).toContain('class="compact-header"');
  expect(html).toContain("<h2>Cliente: &lt;img");
  expect(html).not.toContain("Saldo pendiente actual de las ventas");
  expect(html).toContain("sus importes no están incluidos en el total");
});
it("preserves exact cents even beyond floating point safe integers", () => {
  expect(statementMoney(900719925474099101n)).toBe(
    "$ 9.007.199.254.740.991,01",
  );
});
