import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import type { FiscalTrial } from "./api";
import { trialTicket } from "./fiscal-trial-ticket";
import { fiscalQrSvg } from "./fiscal-qr-image";

const qrUrl =
  "https://www.arca.gob.ar/fe/qr/?p=" +
  btoa(
    JSON.stringify({
      ver: 1,
      fecha: "2026-10-03",
      cuit: 20247237837,
      ptoVta: 3,
      tipoCmp: 11,
      nroCmp: 7,
      importe: 190,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: "E",
      codAut: 12345678901234,
    }),
  );
const document: FiscalTrial = {
  id: "document",
  requestId: "request",
  sourceSaleId: "sale",
  environment: "PRODUCTION",
  kind: "INVOICE",
  point: 3,
  voucherType: 11,
  number: 7,
  date: "20261003",
  totalMinor: 19000,
  status: "AUTHORIZED",
  cae: "12345678901234",
  caeExpires: "20261013",
  detail: null,
  qrUrl,
  issuer: {
    legalName: "Titular fiscal",
    cuit: "20247237837",
    vatCondition: "MONOTAX",
    address: "Domicilio fiscal",
    city: "Posadas",
    province: "Misiones",
    grossIncomeId: "20247237837",
    activityStart: "2026-01-01",
    postalCode: "3300",
  },
  saleSnapshot: {
    store: { name: "Farmacia Juncos" },
    branchName: "Casa Central",
    cashier: "Ana",
    recipient: { name: "Consumidor final", docNumber: "0", vatId: 5 },
    items: [
      {
        name: "Producto histórico",
        quantity: 2,
        unitPriceMinor: "10000",
        discountMinor: "1000",
        amountMinor: "19000",
      },
    ],
  },
};
describe("production print", () => {
  it("uses the commercial header first, preserved values, CAE and QR without trial legends", () => {
    const html = trialTicket(document);
    expect(html.indexOf('alt="Farmacia Juncos"')).toBeLessThan(
      html.indexOf("Titular fiscal"),
    );
    for (const text of [
      "FACTURA C",
      "00003-00000007",
      "A CONSUMIDOR FINAL",
      "Producto histórico",
      "12345678901234",
      "13/10/2026",
      'aria-label="QR fiscal ARCA"',
    ])
      expect(html).toContain(text);
    for (const text of [
      "PRUEBA",
      "SIN VALIDEZ FISCAL",
      "homologación",
      "Artículo de prueba",
    ])
      expect(html).not.toContain(text);
  });
  it("labels credit notes C and identifies their original invoice", () => {
    const html = trialTicket({
      ...document,
      kind: "CREDIT_NOTE",
      voucherType: 13,
      reason: "Devolución <script>",
      saleSnapshot: {
        ...document.saleSnapshot!,
        originalNumber: "00003-00000007",
      },
    });
    expect(html).toContain("NOTA DE CRÉDITO C");
    expect(html).toContain("Factura asociada");
    expect(html).toContain("Devolución &lt;script&gt;");
    expect(html).not.toContain("NOTA DE CRÉDITO B");
  });
  it("fails closed for non-authorized or incomplete production documents", () => {
    const invalid: Partial<FiscalTrial>[] = [
      { status: "UNCERTAIN" },
      { qrUrl: null },
      { cae: "bad" },
      { saleSnapshot: undefined },
    ];
    for (const patch of invalid)
      expect(() => trialTicket({ ...document, ...patch })).toThrow();
    expect(
      trialTicket({ ...document, environment: "HOMOLOGATION", qrUrl: null }),
    ).toContain("SIN VALIDEZ FISCAL");
  });
  it("preserves every QR module, white background and four-module quiet zone", () => {
    const svg = fiscalQrSvg(qrUrl);
    const matrix = QRCode.create(qrUrl, { errorCorrectionLevel: "M" }).modules;
    const rectangles = [
      ...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1"\/>/g),
    ];
    const pixels = new Set(
      rectangles.map((m) => `${Number(m[1]) - 4},${Number(m[2]) - 4}`),
    );
    for (let y = 0; y < matrix.size; y++)
      for (let x = 0; x < matrix.size; x++)
        expect(pixels.has(`${x},${y}`)).toBe(Boolean(matrix.get(y, x)));
    expect(svg).toContain(
      `viewBox="0 0 ${matrix.size + 8} ${matrix.size + 8}"`,
    );
    expect(svg).toContain('fill="white"');
    for (const url of [
      "javascript:alert(1)",
      "https://example.com/fe/qr/?p=x",
      "https://www.arca.gob.ar/fe/qr/",
    ])
      expect(() => fiscalQrSvg(url)).toThrow();
  });
});
