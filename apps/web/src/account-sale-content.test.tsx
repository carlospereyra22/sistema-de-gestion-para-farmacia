import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountSaleArticles } from "./account-sale-articles";
import { AccountSaleTimeline } from "./account-sale-timeline";
import type { DueSaleDetail } from "./lib/account-due-sale";

const data: DueSaleDetail = {
  id: "sale",
  customer: {
    id: "customer",
    name: "Abel",
    document: null,
    billingTaxId: null,
    billingPhone: null,
    creditEnabled: true,
  },
  branchName: "Central",
  saleDate: "2026-10-01T12:00:00Z",
  dueDate: null,
  status: "UNDATED",
  daysOverdue: 0,
  totalMinor: "20000",
  financedMinor: "20000",
  paidMinor: "10000",
  pendingMinor: "10000",
  reviewReason: null,
  seller: null,
  items: [
    {
      id: "item",
      name: "Actron 400x20",
      quantity: 2,
      unitPriceMinor: "10000",
      discountMinor: "0",
      totalMinor: "20000",
      pendingMinor: "10000",
    },
  ],
  payments: [
    {
      id: "payment",
      at: "2026-10-02T12:00:00Z",
      method: "TRANSFER",
      amountMinor: "10000",
      note: null,
      actor: "Admin",
      shared: false,
    },
  ],
  events: [
    {
      id: "payment",
      at: "2026-10-02T12:00:00Z",
      title: "Cobro aplicado",
      detail: null,
      actor: "Admin",
      amountMinor: "10000",
      kind: "payment",
      calculated: false,
      settled: false,
    },
    {
      id: "sale",
      at: "2026-10-01T12:00:00Z",
      title: "Venta a cuenta corriente",
      detail: "Sale sale",
      actor: null,
      amountMinor: "20000",
      kind: "debit",
      calculated: false,
      settled: false,
    },
  ],
};
it("uses original article amounts and separate quantity/unit-price detail", () => {
  const html = renderToStaticMarkup(<AccountSaleArticles data={data} />);
  expect(html).toContain("Actron 400x20");
  expect(html).toContain("2 unidades");
  expect(html).toContain("200,00");
  expect(html).toContain("Total original de la venta");
  expect(html).toContain("<ol");
  expect(html).toContain("c/u");
  expect(html).toContain("100,00");
  expect(html).toContain("01");
  expect(html).toContain('aria-label="Total:');
});
it("renders sale then payment with distinct icons and actual payment method", () => {
  const html = renderToStaticMarkup(<AccountSaleTimeline data={data} />);
  expect(html.indexOf("Venta registrada")).toBeLessThan(
    html.indexOf("Pago por transferencia"),
  );
  expect(html).toContain("lucide-receipt-text");
  expect(html).toContain("lucide-arrow-left-right");
  expect(html).toContain("Usuario: Admin");
  expect(html).not.toContain("Sale sale");
  expect(html).toContain("2 eventos");
});
it("distinguishes adjustments and calculated due milestones without inventing payment methods", () => {
  const html = renderToStaticMarkup(
    <AccountSaleTimeline
      data={{
        ...data,
        payments: [],
        events: [
          data.events[0],
          { ...data.events[1], id: "adjust", title: "Actualización del saldo" },
          { ...data.events[1], id: "due", kind: "due", calculated: true },
        ],
      }}
    />,
  );
  expect(html).toContain("Cobro aplicado");
  expect(html).not.toContain("Pago por transferencia");
  expect(html).toContain("lucide-trending-up");
  expect(html).toContain("lucide-circle-alert");
  expect(html).toContain("Hito calculado");
});
