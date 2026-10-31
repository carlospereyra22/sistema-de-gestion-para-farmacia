import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReceiptDebtFields } from "./receipt-debt";
import { suggestedDebt, receiptDebtBody } from "./receipt-debt-rules";
describe("receipt debt suggestion", () => {
  it("uses Argentina civil day and optional supplier term", () => {
    const now = new Date("2026-10-21T01:00:00Z");
    expect(
      suggestedDebt({ accountEnabled: true, accountTermDays: 30 }, now),
    ).toEqual({ enabled: true, dueOn: "2026-11-19" });
    expect(suggestedDebt(undefined, now)).toEqual({
      enabled: false,
      dueOn: "",
    });
    expect(
      suggestedDebt({ accountEnabled: true, accountTermDays: 0 }, now).dueOn,
    ).toBe("2026-10-20");
  });
  it("uses received estimate, accepts adjustment, and can explicitly omit debt", () => {
    expect(receiptDebtBody({ enabled: true, dueOn: "" }, "70000,00")).toEqual({
      amountMinor: "7000000",
      dueOn: null,
    });
    expect(
      receiptDebtBody({ enabled: true, dueOn: "", amount: "65000" }, "70000"),
    ).toEqual({ amountMinor: "6500000", dueOn: null });
    expect(
      receiptDebtBody({ enabled: false, dueOn: "" }, "70000"),
    ).toBeUndefined();
    expect(() => receiptDebtBody({ enabled: true, dueOn: "" }, "0")).toThrow();
  });
  it("explains pre-existing debts and does not hide the opt-out", () => {
    const html = renderToStaticMarkup(
      <ReceiptDebtFields
        value={{ enabled: true, dueOn: "" }}
        estimated="70000"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Registrar deuda de esta entrega");
    expect(html).toContain("la deuda ya fue registrada");
    expect(html).toContain("No mueve Caja");
  });
  it("does not offer another debt for a purchase already registered", () => {
    const html = renderToStaticMarkup(
      <ReceiptDebtFields
        registered
        value={{ enabled: true, dueOn: "" }}
        estimated="0,00"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Deuda ya registrada");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("0,00");
  });
  it("prefills the pending estimate before quantities, then uses received amounts and preserves manual edits", () => {
    const render = (
      estimated: string,
      pendingEstimate?: string,
      amount?: string,
    ) =>
      renderToStaticMarkup(
        <ReceiptDebtFields
          value={{ enabled: true, dueOn: "", amount }}
          estimated={estimated}
          pendingEstimate={pendingEstimate}
          onChange={() => undefined}
        />,
      );
    expect(render("0,00", "144000,00")).toContain('value="144000,00"');
    expect(render("72000,00")).toContain('value="72000,00"');
    expect(render("72000,00", undefined, "65000")).toContain('value="65000"');
  });
});
