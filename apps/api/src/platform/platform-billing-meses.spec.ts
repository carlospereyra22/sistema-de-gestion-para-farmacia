import { lastMonths } from "./platform-billing.service";

describe("meses del gráfico de cobros", () => {
  it("devuelve los últimos meses, del más viejo al actual, cruzando el año", () => {
    expect(lastMonths("2026-02-15", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(lastMonths("2026-11-11", 12)).toHaveLength(12);
    expect(lastMonths("2026-11-11", 12).at(-1)).toBe("2026-11");
    expect(lastMonths("2026-11-11", 12)[0]).toBe("2025-12");
  });
});
