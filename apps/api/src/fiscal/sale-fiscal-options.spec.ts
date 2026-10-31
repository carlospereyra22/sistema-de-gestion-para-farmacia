import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  SaleFiscalOptionsDto,
  saleFiscalRecipient,
} from "./sale-fiscal-options";

describe("per-sale fiscal options", () => {
  const customer = {
    name: "Cliente cuenta corriente",
    billingName: "Empresa",
    billingVatCondition: "Monotributista",
    billingTaxId: "20247237837",
    document: null,
  };
  it("keeps legacy customer behavior when options are absent", () => {
    expect(saleFiscalRecipient(customer)).toMatchObject({
      name: "Empresa",
      vatId: 6,
      docType: 80,
    });
  });
  it("uses explicit final consumer without modifying the commercial customer", () => {
    const before = { ...customer };
    expect(
      saleFiscalRecipient(customer, {
        recipient: "FINAL_CONSUMER",
        voucherType: 11,
      }),
    ).toEqual({
      name: "Consumidor final",
      vatId: 5,
      docType: 99,
      docNumber: "0",
    });
    expect(customer).toEqual(before);
  });
  it("accepts identified final consumers and validates their CUIT", () => {
    expect(
      saleFiscalRecipient(null, {
        recipient: "FINAL_CONSUMER",
        voucherType: 11,
        consumerName: " Ana ",
        consumerDocument: "12345678",
      }),
    ).toEqual({ name: "Ana", vatId: 5, docType: 96, docNumber: "12345678" });
    expect(
      saleFiscalRecipient(null, {
        recipient: "FINAL_CONSUMER",
        voucherType: 11,
        consumerDocument: "20247237837",
      }),
    ).toMatchObject({ vatId: 5, docType: 80 });
    expect(() =>
      saleFiscalRecipient(null, {
        recipient: "FINAL_CONSUMER",
        voucherType: 11,
        consumerDocument: "20247237838",
      }),
    ).toThrow();
  });
  it("requires a selected customer and rejects mixed receiver sources", () => {
    expect(() =>
      saleFiscalRecipient(null, { recipient: "CUSTOMER", voucherType: 11 }),
    ).toThrow("Seleccioná");
    expect(() =>
      saleFiscalRecipient(customer, {
        recipient: "CUSTOMER",
        voucherType: 11,
        consumerDocument: "12345678",
      }),
    ).toThrow("No combines");
    expect(
      saleFiscalRecipient(customer, { recipient: "CUSTOMER", voucherType: 11 }),
    ).toMatchObject({ name: "Empresa", vatId: 6 });
  });
  it.each([
    { recipient: "FINAL_CONSUMER", voucherType: 1 },
    { recipient: "UNKNOWN", voucherType: 11 },
    { recipient: "FINAL_CONSUMER", voucherType: 11, consumerDocument: "abc" },
    {
      recipient: "FINAL_CONSUMER",
      voucherType: 11,
      consumerName: "a".repeat(161),
    },
  ])("validates untrusted request data: %j", async (input) => {
    const dto = plainToInstance(SaleFiscalOptionsDto, input);
    expect((await validate(dto)).length).toBeGreaterThan(0);
    expect(() => saleFiscalRecipient(customer, dto)).toThrow();
  });
  it("accepts the default options at the request boundary", async () => {
    expect(
      await validate(
        plainToInstance(SaleFiscalOptionsDto, {
          recipient: "FINAL_CONSUMER",
          voucherType: 11,
        }),
      ),
    ).toHaveLength(0);
  });
});
