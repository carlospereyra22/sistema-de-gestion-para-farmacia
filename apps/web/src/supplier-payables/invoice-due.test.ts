import { describe, expect, it } from "vitest";
import { supplierInvoiceDue } from "./invoice-due";
describe("manual supplier debt due suggestion", () => {
  it("uses the supplier's 15 days from the registration date", () => {
    expect(
      supplierInvoiceDue(
        { accountEnabled: true, accountTermDays: 15 },
        "2026-10-20",
      ),
    ).toEqual({ mode: "date", dueOn: "2026-11-04" });
  });
  it("supports zero days, leap years and date changes", () => {
    expect(
      supplierInvoiceDue(
        { accountEnabled: true, accountTermDays: 0 },
        "2026-10-20",
      ).dueOn,
    ).toBe("2026-10-20");
    expect(
      supplierInvoiceDue(
        { accountEnabled: true, accountTermDays: 15 },
        "2028-02-20",
      ).dueOn,
    ).toBe("2028-03-06");
  });
  it("does not invent terms for cash suppliers or missing terms", () => {
    for (const supplier of [
      undefined,
      { accountEnabled: false, accountTermDays: 15 },
      { accountEnabled: true, accountTermDays: null },
    ])
      expect(supplierInvoiceDue(supplier, "2026-10-20")).toEqual({
        mode: "none",
        dueOn: "",
      });
  });
});
