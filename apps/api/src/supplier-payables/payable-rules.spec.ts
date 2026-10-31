import {
  payableToday,
  civilDate,
  documentIdentity,
  dueSummary,
  validatePayable,
  type PayableInput,
} from "./payable-rules";
const input: PayableInput = {
  operationId: "x",
  supplierId: "s",
  documentType: "FACTURA_A",
  pointOfSale: "0003",
  documentNumber: "00001245",
  issuedOn: "2026-10-01",
  amountMinor: "50000000",
  dues: [
    { dueOn: "2026-10-10", amountMinor: "20000000" },
    { dueOn: "2026-11-10", amountMinor: "30000000" },
  ],
};
it("uses Argentina civil dates across UTC midnight", () => {
  expect(payableToday(new Date("2026-10-20T02:00:00Z"))).toBe("2026-10-19");
});
it("validates exact totals and impossible dates", () => {
  expect(validatePayable(input, "2026-10-20").amountMinor).toBe(50000000n);
  expect(() => civilDate("2026-02-30")).toThrow();
  expect(() =>
    validatePayable({ ...input, amountMinor: "1" }, "2026-10-20"),
  ).toThrow();
  expect(() =>
    validatePayable({ ...input, issuedOn: "2027-01-01" }, "2026-10-20"),
  ).toThrow();
  expect(() =>
    validatePayable({
      ...input,
      dues: [{ dueOn: null, amountMinor: "20000000" }, input.dues[1]!],
    }),
  ).toThrow();
});
it("preserves written zeros but prevents equivalent document identities", () => {
  expect(documentIdentity("0003", "0003-00001245").documentKey).toBe("3:1245");
  expect(() => documentIdentity("0004", "0003-00001245")).toThrow();
  expect(documentIdentity("0003", "00001245")).toEqual({
    pointOfSale: "0003",
    documentNumber: "00001245",
    documentKey: "3:1245",
  });
  expect(documentIdentity("", "0003-00001245").documentKey).toBe(
    documentIdentity("3", "1245").documentKey,
  );
});
it("counts only due installments, not the entire invoice", () => {
  const summary = dueSummary(
    validatePayable(input, "2026-10-20").dues,
    "2026-10-20",
  );
  expect(summary.overdueMinor).toBe("20000000");
  expect(summary.next30Minor).toBe("30000000");
  expect(summary.dueStatus).toBe("OVERDUE");
  expect(
    dueSummary([{ dueOn: null, amountMinor: 100n }], "2026-10-20").dueStatus,
  ).toBe("UNDATED");
  expect(
    dueSummary(
      [{ dueOn: civilDate("2026-10-20"), amountMinor: 100n }],
      "2026-10-20",
    ).todayMinor,
  ).toBe("100");
});
