import { describe, expect, it } from "vitest";
import { prepareAccountPayment } from "./account-payment";

const account = {
  active: true,
  creditEnabled: true,
  creditLimitMinor: "50000",
  balanceMinor: "10000",
};
describe("Selecting current account", () => {
  it("covers the whole pending sale", () => {
    expect(prepareAccountPayment(25000, [], account)).toEqual([
      { method: "ACCOUNT", amountMinor: 25000 },
    ]);
  });
  it("preserves other payments and does not duplicate repeated clicks", () => {
    const result = prepareAccountPayment(
      25000,
      [{ method: "CASH", amountMinor: 5000 }],
      account,
    );
    expect(result).toEqual([
      { method: "CASH", amountMinor: 5000 },
      { method: "ACCOUNT", amountMinor: 20000 },
    ]);
    expect(prepareAccountPayment(25000, result, account)).toEqual(result);
  });
  it("checks eligibility, available credit and already paid sales", () => {
    expect(() => prepareAccountPayment(45000, [], account)).toThrow(
      "crédito disponible",
    );
    expect(() =>
      prepareAccountPayment(100, [], { ...account, creditEnabled: false }),
    ).toThrow();
    expect(() =>
      prepareAccountPayment(100, [], { ...account, active: false }),
    ).toThrow();
    expect(() => prepareAccountPayment(100, [], undefined)).toThrow();
    expect(() =>
      prepareAccountPayment(
        100,
        [{ method: "CARD", amountMinor: 100 }],
        account,
      ),
    ).toThrow();
  });
  it("supports unlimited credit and recalculates an existing account payment", () => {
    expect(
      prepareAccountPayment(90000, [{ method: "ACCOUNT", amountMinor: 100 }], {
        ...account,
        creditLimitMinor: null,
      }),
    ).toEqual([{ method: "ACCOUNT", amountMinor: 90000 }]);
  });
});
