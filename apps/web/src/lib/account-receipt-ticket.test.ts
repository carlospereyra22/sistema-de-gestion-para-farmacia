import { describe, expect, it } from "vitest";
import { accountReceiptHtml } from "./account-receipt-ticket";
import type { AccountReceipt } from "./api";

const receipt: AccountReceipt = {
  id: "receipt-123",
  createdAt: "2026-09-09T15:00:00Z",
  customerName: "Carlos",
  branchName: "Central",
  amountMinor: "300000",
  method: "CASH",
  note: null,
  balanceAfterMinor: "1650000",
  items: [{ name: "Actron", saleId: "sale-123", amountMinor: "300000" }],
};
describe("account payment ticket", () => {
  it("prints the mixed receipt breakdown", () => {
    const html = accountReceiptHtml(
      {
        ...receipt,
        method: "MIXED",
        payments: [
          { method: "CASH", amountMinor: "100000" },
          { method: "CARD", amountMinor: "200000" },
        ],
      },
      "http://localhost",
    );
    expect(html).toContain("Efectivo");
    expect(html).toContain("Tarjeta");
    expect(html).toContain("1.000,00");
    expect(html).toContain("2.000,00");
  });
  it("prints paid amounts and historical balance in the sales thermal format", () => {
    const html = accountReceiptHtml(receipt, "http://localhost");
    expect(html).toContain("width:80mm");
    expect(html).toContain("grid-template-columns:max-content minmax(0,1fr)");
    expect(html).toContain("RECIBIDO");
    expect(html).not.toContain("Operación:");
    expect(html).not.toContain("No es factura fiscal");
    expect(html).toContain("3.000,00");
    expect(html).toContain("16.500,00");
    expect(html).toContain("Actron");
    expect(html).not.toContain("SALE-123");
    expect(html).not.toContain("Venta ");
    expect(html).toContain("Efectivo");
    expect(html).toContain("12:00:00");
  });
  it("escapes all user content", () => {
    const html = accountReceiptHtml(
      {
        ...receipt,
        customerName: '<script>alert("x")</script>',
        note: '<img onerror="evil()">',
        items: [{ ...receipt.items[0]!, name: "<b>Product</b>" }],
      },
      "http://localhost",
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;b&gt;Product&lt;/b&gt;");
  });
  it("does not invent a historical balance for legacy receipts", () => {
    const html = accountReceiptHtml(
      { ...receipt, balanceAfterMinor: null, items: [] },
      "http://localhost",
    );
    expect(html).not.toContain("Saldo pendiente al cobrar");
    expect(html).toContain("Pago a cuenta corriente");
  });
});
