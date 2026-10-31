import { allocatePayment } from "./payment-rules";
describe("supplier payment allocation", () => {
  const dues = [
    { id: "b", sequence: 1, dueOn: new Date("2026-11-01"), balanceMinor: 100n },
    { id: "a", sequence: 2, dueOn: new Date("2026-10-01"), balanceMinor: 100n },
  ];
  it("uses earliest unpaid due date, preserving cents", () =>
    expect(allocatePayment(dues, 129n)).toEqual([
      { dueId: "a", amountMinor: 100n },
      { dueId: "b", amountMinor: 29n },
    ]));
  it("handles undated debts and blocks zero or excessive payments", () => {
    expect(allocatePayment([{ ...dues[0]!, dueOn: null }], 100n)).toEqual([
      { dueId: "b", amountMinor: 100n },
    ]);
    expect(() => allocatePayment(dues, 0n)).toThrow();
    expect(() => allocatePayment(dues, 201n)).toThrow();
  });
});
