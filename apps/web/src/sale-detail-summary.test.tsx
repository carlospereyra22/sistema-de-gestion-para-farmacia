import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SaleDetailTotal, SalePaymentSummary } from "./sale-detail-summary";

it("shows each payment method once without confusing tendered amounts with net receipts", () => {
  const html = renderToStaticMarkup(
    <SalePaymentSummary
      payments={[
        { method: "CASH", amountMinor: "20000" },
        { method: "CASH", amountMinor: "10000" },
        { method: "ACCOUNT", amountMinor: "3000" },
        { method: "CARD", amountMinor: "1000" },
        { method: "TRANSFER", amountMinor: "1000" },
        { method: "OTHER", amountMinor: "1000" },
      ]}
    />,
  );
  expect(html.match(/>Efectivo</g)).toHaveLength(1);
  for (const value of [
    "Cuenta corriente",
    "Tarjeta",
    "Transferencia",
    "Otro",
    "Medios de pago",
  ])
    expect(html).toContain(value);
  expect(html).not.toContain("20000");
});
it("distinguishes missing payments from cash", () => {
  const html = renderToStaticMarkup(<SalePaymentSummary payments={[]} />);
  expect(html).toContain("Sin cobro registrado");
  expect(html).not.toContain("Efectivo");
});
it("keeps the historical total and sale status separate from fiscal authorization", () => {
  const html = renderToStaticMarkup(
    <SaleDetailTotal
      total="$ 300.000,00"
      status="COMPLETED"
      documentType="INVOICE"
    />,
  );
  expect(html).toContain("$ 300.000,00");
  expect(html).toContain("Confirmada");
  expect(html).toContain("Factura");
  expect(html).not.toContain("Autorizada");
  const cancelled = renderToStaticMarkup(
    <SaleDetailTotal
      total="$ 0,00"
      status="CANCELLED"
      documentType="INTERNAL"
    />,
  );
  expect(cancelled).toContain("Anulada");
  expect(cancelled).toContain("Ticket");
});
