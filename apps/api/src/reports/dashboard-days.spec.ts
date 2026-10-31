import { dashboardDays } from "./dashboard-days";
describe("dashboard Argentina days", () => {
  it("uses local midnight across month and year boundaries", () => {
    const days = dashboardDays(new Date("2026-01-01T02:59:59Z"));
    expect(days).toHaveLength(7);
    expect(days[6]!.date).toBe("2025-12-31");
    expect(days[6]!.start.toISOString()).toBe("2025-12-31T03:00:00.000Z");
    expect(days[6]!.end.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(days[0]!.date).toBe("2025-12-25");
  });
  it("starts the next local day at 03:00 UTC", () => {
    expect(dashboardDays(new Date("2026-01-01T03:00:00Z"))[6]!.date).toBe(
      "2026-01-01",
    );
  });
});
