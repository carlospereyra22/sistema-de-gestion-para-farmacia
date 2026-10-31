import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FiscalTesting } from "./fiscal-testing";
import { trialTicket } from "./lib/fiscal-trial-ticket";
import type { FiscalTrial } from "./lib/api";
describe("fiscal testing", () => {
  const trial = {
    id: "test",
    requestId: "test",
    point: 1,
    voucherType: 11,
    number: 1,
    date: "20260927",
    totalMinor: 10000,
    status: "AUTHORIZED",
    cae: "12345678901234",
    caeExpires: "20261007",
    detail: null,
    issuer: {
      legalName: "<script>alert(1)</script>",
      cuit: "20247237837",
      vatCondition: "MONOTAX",
      address: "Test",
      city: "Test",
      province: "Test",
      grossIncomeId: "",
      activityStart: "2026-01-01",
      postalCode: "",
    },
  } satisfies FiscalTrial;
  it("prints only authorized sandbox documents and escapes issuer data", () => {
    expect(() => trialTicket({ ...trial, status: "UNCERTAIN" })).toThrow();
    const html = trialTicket(trial);
    expect(html).toContain("SIN VALIDEZ FISCAL");
    expect(html).toContain("CAE de homologación");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("80mm");
  });
  it("never sends or prints on load; explains isolated trial", () => {
    const html = renderToStaticMarkup(
      <FiscalTesting token="test" organizationId="org" />,
    );
    expect(html).toContain("Probar conexión con ARCA");
    expect(html).toContain("sin ventas, stock ni caja");
    expect(html).not.toContain("Emitir factura de prueba");
  });
  it("prints the saved sale items and recipient instead of the demo article", () => {
    const html = trialTicket({
      ...trial,
      sourceSaleId: "sale",
      totalMinor: 19000,
      saleSnapshot: {
        recipient: { name: "<Cliente>", docNumber: "12345678" },
        items: [
          {
            name: "<Producto>",
            quantity: 2,
            unitPriceMinor: "10000",
            discountMinor: "1000",
            amountMinor: "19000",
          },
        ],
      },
    });
    expect(html).toContain("&lt;Cliente&gt;");
    expect(html).toContain("&lt;Producto&gt;");
    expect(html).toContain("STOCK Y COBROS REGISTRADOS");
    expect(html).toContain("DESCUENTO");
    expect(html).not.toContain("Artículo de prueba");
    expect(html).not.toContain("SIN MOVIMIENTOS");
  });
  it("shares the internal ticket layout, commercial header, payments and change", () => {
    const ticket = {
      kind: "sale" as const,
      id: "sale",
      number: "ABCD1234",
      date: "2026-09-27T12:00:00Z",
      store: { name: "Farmacia Juncos" },
      branch: "Casa Central",
      customer: "Consumidor final",
      cashier: "Ana",
      items: [
        {
          name: "Producto",
          quantity: 1,
          unitPriceMinor: "10000",
          amountMinor: "10000",
        },
      ],
      totalMinor: "10000",
      payments: [{ method: "CASH", amountMinor: "20000" }],
      receivedMinor: "20000",
      changeMinor: "10000",
    };
    const html = trialTicket({ ...trial, ticket });
    const header = html.slice(
      html.indexOf("<header>"),
      html.indexOf("</header>"),
    );
    expect(header).toContain('alt="Farmacia Juncos"');
    expect(header).not.toContain(trial.issuer.legalName);
    expect(html).toContain("Razón social");
    expect(html).toContain("FORMA DE PAGO");
    expect(html).toContain("Vuelto");
    expect(html).toContain("Ana");
    expect(html).toContain("00001-00000001");
    expect(html).not.toContain("DOCUMENTO</span><span>0");
  });
});
