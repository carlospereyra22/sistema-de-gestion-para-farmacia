import { describe, expect, it } from "vitest";
import type { ThermalTicket } from "@gestion/contracts";
import { a4DocumentHtml, type A4Template } from "./a4-document";
import type { ThermalFiscalDetails } from "./thermal-ticket";

const ticket: ThermalTicket = {
  kind: "sale",
  id: "sale-1",
  number: "F1C2A6DD",
  date: "2026-11-02T15:30:00Z",
  store: {
    name: "Farmacia <Juncos>",
    address: "Av. Centenario 2606 · Posadas, Misiones",
    contact: "CUIT 20-24723783-7 · Tel. 376 400-0000",
    logoRaster: "ignorado",
  },
  branch: "Casa Central",
  cashier: "Dani",
  customer: "Público general",
  items: [
    {
      name: "Amoxicilina 500 mg",
      quantity: 2,
      unitPriceMinor: "845000",
      amountMinor: "1690000",
    },
    {
      name: "Perfume Ciel Magic x50ml",
      quantity: 1,
      unitPriceMinor: "1357802",
      amountMinor: "1357802",
    },
  ],
  subtotalMinor: "3047802",
  discountMinor: "47802",
  totalMinor: "3000000",
  payments: [{ method: "CASH", amountMinor: "3500000" }],
  receivedMinor: "3500000",
  changeMinor: "500000",
};
const template: A4Template = {
  accentColor: "#0f9b8e",
  footerText: "Gracias por tu compra\nWhatsApp 376 400-0000",
  logo: "data:image/jpeg;base64,/9j/AAAA",
};
const fiscal: ThermalFiscalDetails = {
  letter: "C",
  number: "00003-00000123",
  date: "02/11/2026",
  legalName: "Pereyra Abel Meregildo",
  cuit: "20247237837",
  address: "Av. Centenario 2606 · Posadas · Misiones",
  vatCondition: "Monotributista",
  grossIncomeId: "20247237837",
  activityStart: "23/06/2021",
  cae: "86440277226023",
  caeExpires: "12/11/2026",
  demo: true,
};

describe("A4 document", () => {
  it("renders an internal voucher with logo, items, totals and footer", () => {
    const html = a4DocumentHtml(ticket, template);
    expect(html).toContain("size:A4");
    expect(html).toContain("Comprobante interno");
    expect(html).toContain("<strong>X</strong>");
    expect(html).toContain("No válido como factura");
    expect(html).toContain("Documento no válido como factura.");
    expect(html).toContain('<img src="data:image/jpeg;base64,/9j/AAAA"');
    expect(html).toContain("Farmacia &lt;Juncos&gt;");
    expect(html).toContain("Amoxicilina 500 mg");
    expect(html).toContain("$ 16.900,00");
    expect(html).toContain("- $ 478,02");
    expect(html).toContain("$ 30.000,00");
    expect(html).toContain("Efectivo");
    // En la hoja sólo va la forma de pago: sin recibido ni vuelto.
    expect(html).not.toContain("Vuelto");
    expect(html).not.toContain("Recibido en efectivo");
    expect(html).toContain("Gracias por tu compra<br>WhatsApp 376 400-0000");
    expect(html).toContain("#0f9b8e");
    // El logo blanco y negro de la térmica no se usa en el A4.
    expect(html).not.toContain("ignorado");
  });

  it("renders an invoice C with issuer, CAE and homologation legend", () => {
    const html = a4DocumentHtml(ticket, template, fiscal);
    expect(html).toContain("Factura C");
    expect(html).toContain("<strong>C</strong>");
    expect(html).toContain("N.º 00003-00000123");
    expect(html).toContain("Monotributista");
    expect(html).toContain("23/06/2021");
    expect(html).toContain("86440277226023");
    expect(html).toContain("Sin validez fiscal");
    expect(html).not.toContain("Documento no válido como factura.");
  });

  it("repeats table headers across pages and keeps rows whole", () => {
    const html = a4DocumentHtml(
      {
        ...ticket,
        items: Array.from({ length: 80 }, (_, index) => ({
          name: `Producto ${index}`,
          quantity: 1,
          unitPriceMinor: "100",
          amountMinor: "100",
        })),
      },
      template,
    );
    expect(html).toContain("thead{display:table-header-group}");
    expect(html).toContain("tr{break-inside:avoid}");
    expect(html.match(/<tr><td>Producto /g)).toHaveLength(80);
  });

  it("drops an unsafe accent, logo or markup", () => {
    const html = a4DocumentHtml(
      { ...ticket, customer: '<script>alert("x")</script>' },
      {
        accentColor: "red;background:url(x)",
        footerText: "<b>pie</b>",
        logo: "javascript:alert(1)",
      },
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("url(x)");
    expect(html).toContain("#087f70");
    expect(html).toContain("&lt;b&gt;pie&lt;/b&gt;");
  });

  it("omits the logo and footer when the organization has none", () => {
    const html = a4DocumentHtml(ticket, {
      accentColor: "#087f70",
      footerText: "  ",
      logo: null,
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<footer>");
  });

  it("marks a cancelled sale", () => {
    expect(a4DocumentHtml({ ...ticket, cancelled: true }, template)).toContain(
      "ANULADA",
    );
  });
});
