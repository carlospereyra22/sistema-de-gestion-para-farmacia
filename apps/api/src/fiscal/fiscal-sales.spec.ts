import { fiscalRecipient } from "./fiscal-sales.service";

describe("homologation sale recipient", () => {
  const customer = {
    name: "Cliente",
    billingName: null,
    billingTaxId: null,
    document: null,
    billingVatCondition: null,
  };
  it("uses an anonymous final consumer only when no recipient document was supplied", () => {
    expect(fiscalRecipient(null)).toMatchObject({
      vatId: 5,
      docType: 99,
      docNumber: "0",
    });
    expect(
      fiscalRecipient({ ...customer, document: "12.345.678" }),
    ).toBeDefined();
  });
  it("validates CUIT and carries fiscal condition without guessing VAT", () => {
    expect(
      fiscalRecipient({
        ...customer,
        billingTaxId: "20-24723783-7",
        billingVatCondition: "Monotributista",
      }),
    ).toMatchObject({ vatId: 6, docType: 80, docNumber: "20247237837" });
    expect(() =>
      fiscalRecipient({
        ...customer,
        billingVatCondition: "Responsable inscripto",
      }),
    ).toThrow("CUIT");
    expect(() =>
      fiscalRecipient({ ...customer, billingTaxId: "20247237838" }),
    ).toThrow();
    expect(() =>
      fiscalRecipient({ ...customer, billingVatCondition: "Unsupported" }),
    ).toThrow();
  });
});
