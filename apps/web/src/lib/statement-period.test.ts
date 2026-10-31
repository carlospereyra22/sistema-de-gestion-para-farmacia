import { expect, it } from "vitest";
import { statementPeriod } from "./statement-period";
it("uses Argentina dates and handles year and leap-month boundaries", () => {
  expect(statementPeriod("month", new Date("2026-01-01T02:00:00Z"))).toEqual({
    from: "2025-12-01",
    to: "2025-12-31",
  });
  expect(statementPeriod("previous", new Date("2024-03-15T12:00:00Z"))).toEqual(
    { from: "2024-02-01", to: "2024-02-29" },
  );
  expect(statementPeriod("30", new Date("2026-01-10T12:00:00Z"))).toEqual({
    from: "2025-12-12",
    to: "2026-01-10",
  });
  expect(statementPeriod("all")).toEqual({ from: "", to: "" });
});
