import { expect, it } from "vitest";
import { mixedReceiptPayments } from "./account-mixed-payment";
it("parses Argentine amounts and omits unused methods", () => {
  expect(
    mixedReceiptPayments({ CASH: "10.000", CARD: "9.290", TRANSFER: "" }),
  ).toEqual([
    { method: "CASH", amountMinor: 1000000 },
    { method: "CARD", amountMinor: 929000 },
  ]);
  expect(
    mixedReceiptPayments({ CASH: "0", CARD: "", TRANSFER: "100,50" }),
  ).toEqual([{ method: "TRANSFER", amountMinor: 10050 }]);
  expect(
    mixedReceiptPayments({ CASH: "-10", CARD: "", TRANSFER: "" }),
  ).toBeNull();
});
