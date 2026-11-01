import {
  changePct,
  divideRounded,
  kpi,
  sharePct,
  trendBuckets,
  trendGranularity,
} from "./report-math";
import { parseReportPeriod } from "./report-period";

const now = new Date("2026-10-31T15:00:00Z");

describe("report math", () => {
  it("variacion sin base de comparacion es null, nunca Infinity", () => {
    expect(changePct(500n, 0n)).toBeNull();
    expect(changePct(500n, null)).toBeNull();
    expect(changePct(112n, 100n)).toBe(12);
    expect(changePct(1n, 3n)).toBe(-66.6);
    expect(changePct(-50n, -100n)).toBe(50);
  });

  it("participacion con total cero es null", () => {
    expect(sharePct(1n, 0n)).toBeNull();
    expect(sharePct(1n, 3n)).toBe(33.3);
  });

  it("arma el KPI con valores como string", () => {
    expect(kpi("money", 198000n, 100000n)).toEqual({
      unit: "money",
      available: true,
      value: "198000",
      previous: "100000",
      changePct: 98,
    });
  });

  it("redondea el ticket promedio a centavos", () => {
    expect(divideRounded(1000n, 3)).toBe(333n);
    expect(divideRounded(1001n, 2)).toBe(501n);
    expect(divideRounded(1000n, 0)).toBeNull();
  });

  it("hasta 92 dias agrupa por dia, mas largo por mes", () => {
    const month = parseReportPeriod(
      { from: "2026-10-01", to: "2026-10-31" },
      now,
    );
    expect(trendGranularity(month)).toBe("day");
    expect(trendBuckets(month, "day")).toHaveLength(31);
    const year = parseReportPeriod(
      { from: "2025-11-15", to: "2026-02-10" },
      now,
    );
    expect(trendGranularity(year)).toBe("day");
    const long = parseReportPeriod(
      { from: "2025-11-15", to: "2026-03-10" },
      now,
    );
    expect(trendGranularity(long)).toBe("month");
    expect(trendBuckets(long, "month")).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });
});
