import type { FiscalDocument } from "@prisma/client";
import {
  authorizedProductionResponse,
  matchesProduction,
  productionBody,
  validFiscalDate,
} from "./production-document";
import { creditLineAmount } from "./credit-lines";
import { saleFiscalRecipient } from "./sale-fiscal-options";

export const productionFixture: FiscalDocument = {
  id: "doc",
  organizationId: "org",
  branchId: "branch",
  sourceSaleId: "sale",
  requestId: "request",
  environment: "PRODUCTION",
  kind: "INVOICE",
  originalId: null,
  status: "PENDING",
  issuerCuit: "20247237837",
  point: 3,
  voucherType: 11,
  number: 7,
  date: "20261003",
  totalMinor: 19000,
  docType: 99,
  docNumber: "0",
  recipientVatId: 5,
  issuer: {},
  saleSnapshot: {},
  reason: null,
  cae: null,
  detail: null,
  caeExpires: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  settledAt: null,
  settlement: null,
};
describe("production protocol guards", () => {
  const doc = productionFixture;
  const head = {
    Cuit: doc.issuerCuit,
    PtoVta: "3",
    CbteTipo: "11",
    CantReg: "1",
    Resultado: "A",
  };
  const detail = {
    Resultado: "A",
    CbteDesde: "7",
    CbteHasta: "7",
    CbteFch: doc.date,
    DocTipo: "99",
    DocNro: "0",
    CAE: "12345678901234",
    CAEFchVto: "20261013",
  };
  it("accepts only a complete matching single-document authorization", () => {
    expect(
      authorizedProductionResponse(
        { FeCabResp: head, FeDetResp: { FECAEDetResponse: detail } },
        doc,
      ),
    ).toBe(true);
    for (const patch of [
      { Cuit: "20123456789" },
      { PtoVta: "1" },
      { CbteTipo: "13" },
      { CantReg: "2" },
    ])
      expect(
        authorizedProductionResponse(
          {
            FeCabResp: { ...head, ...patch },
            FeDetResp: { FECAEDetResponse: detail },
          },
          doc,
        ),
      ).toBe(false);
    for (const patch of [
      { CbteHasta: "8" },
      { DocNro: "123" },
      { CAE: "00000000000000" },
      { CAEFchVto: "20260230" },
      { CAEFchVto: "20261002" },
      { CbteFch: "20261004" },
    ])
      expect(
        authorizedProductionResponse(
          {
            FeCabResp: head,
            FeDetResp: { FECAEDetResponse: { ...detail, ...patch } },
          },
          doc,
        ),
      ).toBe(false);
  });
  it("matches consultation against persisted amount, receiver and point", () => {
    const result = {
      ...detail,
      PtoVta: "3",
      CbteTipo: "11",
      Concepto: "1",
      MonId: "PES",
      MonCotiz: "1",
      ImpTotal: "190.00",
      ImpNeto: "190.00",
      ImpIVA: "0.00",
      ImpTrib: "0",
      ImpOpEx: "0",
      ImpTotConc: "0",
      CodAutorizacion: detail.CAE,
      FchVto: detail.CAEFchVto,
    };
    expect(matchesProduction(result, doc)).toBe(true);
    for (const patch of [
      { ImpTotal: "190.01" },
      { MonCotiz: "2" },
      { ImpIVA: "1" },
      { DocTipo: "80" },
      { ImpNeto: "0" },
      { CbteTipo: "13" },
    ])
      expect(matchesProduction({ ...result, ...patch }, doc)).toBe(false);
  });
  it("serializes C without assumed VAT and a partial credit with its original", () => {
    expect(productionBody(doc)).toContain("<ImpIVA>0</ImpIVA>");
    expect(productionBody(doc)).toContain("<ImpNeto>190.00</ImpNeto>");
    expect(productionBody(doc)).not.toContain("<Iva>");
    const credit = {
      ...doc,
      kind: "CREDIT_NOTE",
      voucherType: 13,
      originalId: doc.id,
      totalMinor: 9500,
    };
    expect(() => productionBody(credit)).toThrow();
    expect(productionBody(credit, { ...doc, status: "AUTHORIZED" })).toContain(
      "<CbtesAsoc><CbteAsoc><Tipo>11</Tipo><PtoVta>3</PtoVta><Nro>7</Nro>",
    );
    expect(() =>
      productionBody(
        { ...credit, totalMinor: 20000 },
        { ...doc, status: "AUTHORIZED" },
      ),
    ).toThrow();
  });
  it("rejects zero DNI and invalid calendar dates", () => {
    expect(() =>
      saleFiscalRecipient(null, {
        recipient: "FINAL_CONSUMER",
        voucherType: 11,
        consumerDocument: "00000000",
      }),
    ).toThrow();
    expect(validFiscalDate("20260230")).toBe(false);
    expect(validFiscalDate("20261003")).toBe(true);
  });
  it("rejects invalid serialized document fields before any SOAP send", () => {
    for (const patch of [
      { kind: "UNKNOWN" },
      { voucherType: 13 },
      { point: 0 },
      { number: 100000000 },
      { docType: 96, docNumber: "0" },
      { issuerCuit: "<xml>" },
      { recipientVatId: 99 },
    ])
      expect(() => productionBody({ ...doc, ...patch })).toThrow();
  });
});
describe("partial returns", () => {
  it("distributes discount cents cumulatively without losing a cent", () => {
    const a = creditLineAmount(100n, 1n, 3, 0, 1);
    const b = creditLineAmount(100n, 1n, 3, 1, 1);
    const c = creditLineAmount(100n, 1n, 3, 2, 1);
    expect([a, b, c]).toEqual([99n, 100n, 100n]);
    expect(a + b + c).toBe(299n);
    expect(creditLineAmount(100n, 1n, 3, 0, 3)).toBe(299n);
  });
  it.each([
    [3, 2, 2],
    [3, 0, 0],
    [3, -1, 1],
    [3, 0, 1.5],
  ])("rejects invalid quantities %j", (sold, prior, quantity) =>
    expect(() => creditLineAmount(100n, 0n, sold, prior, quantity)).toThrow(),
  );
});
