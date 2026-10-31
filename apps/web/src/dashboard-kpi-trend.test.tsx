import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardKpiTrend } from "./dashboard-kpi-trend";

describe("DashboardKpiTrend", () => {
  it("keeps zero days empty while showing the real comparison and accessible series", () => {
    const html = renderToStaticMarkup(
      <DashboardKpiTrend
        days={[
          { date: "2026-10-12", totalMinor: "0", count: 0 },
          { date: "2026-10-13", totalMinor: "10000", count: 4 },
          { date: "2026-10-14", totalMinor: "12500", count: 5 },
        ]}
        kind="tickets"
        color="#1673ed"
      />,
    );
    expect(html).toContain("25% vs. ayer");
    expect(html).toContain("2026-10-12: 0");
    expect(html).toContain("M 3 47");
    expect(html).toContain('role="img"');
    expect(html).toContain("linearGradient");
  });
  it("does not invent activity for an empty series", () => {
    const html = renderToStaticMarkup(
      <DashboardKpiTrend
        days={[
          { date: "2026-10-13", totalMinor: "0", count: 0 },
          { date: "2026-10-14", totalMinor: "0", count: 0 },
        ]}
        kind="sales"
        color="#008b75"
      />,
    );
    expect(html).toContain("Sin actividad ambos días");
    expect(html).toContain("M 3 47 C 50 47 50 47 97 47");
  });
});
