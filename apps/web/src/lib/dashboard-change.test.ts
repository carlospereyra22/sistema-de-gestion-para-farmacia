import { expect, it } from "vitest";
import { dashboardChange } from "./dashboard-change";
it("calculates increases, decreases and unchanged totals", () => {
  expect(dashboardChange(11200n, 10000n)).toEqual({
    direction: 1,
    label: "12% vs. ayer",
  });
  expect(dashboardChange(7500n, 10000n)).toEqual({
    direction: -1,
    label: "25% vs. ayer",
  });
  expect(dashboardChange(100n, 100n)).toEqual({
    direction: 0,
    label: "0% vs. ayer",
  });
});
it("does not invent percentages when yesterday was zero", () => {
  expect(dashboardChange(10n, 0n).label).toBe("Ayer sin actividad");
  expect(dashboardChange(0n, 0n).label).toBe("Sin actividad ambos días");
  expect(dashboardChange(0n, 100n).label).toBe("100% vs. ayer");
});
