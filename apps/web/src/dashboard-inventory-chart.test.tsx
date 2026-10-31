import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardInventoryChart } from "./dashboard-inventory-chart";
import { DashboardMiniChart } from "./dashboard-mini-chart";

describe("inventory charts", () => {
  it("labels categories and uses their actual proportions", () => {
    const html = renderToStaticMarkup(
      <DashboardInventoryChart
        kind="missing"
        color="#e88013"
        rows={[
          { label: "Medicamentos", value: 3 },
          { label: "Perfumería", value: 1 },
        ]}
      />,
    );
    expect(html).toContain("Medicamentos");
    expect(html).toContain("Perfumería");
    expect(html).toContain("width:100%");
    expect(html).toContain("width:33.333");
    expect(html).toContain('aria-label="Faltantes por categoría"');
    expect(html).not.toContain("<title");
  });
  it("distinguishes expired lots and preserves zero buckets", () => {
    const html = renderToStaticMarkup(
      <DashboardInventoryChart
        kind="expiry"
        color="#8b45ee"
        rows={[
          "Vencidos",
          "Hasta 7 días",
          "8 a 14 días",
          "15 a 21 días",
          "22 a 30 días",
        ].map((label, i) => ({ label, value: i === 0 ? 2 : 0 }))}
      />,
    );
    expect(html).toContain("Venc.");
    expect(html).toContain("≤7d");
    expect(html).toContain("30d");
    expect(html).toContain("height:0%");
    expect(html).toContain("#f43f5e");
  });
  it("shows explicit empty states, not decorative activity", () => {
    for (const kind of ["missing", "expiry"] as const) {
      const html = renderToStaticMarkup(
        <DashboardInventoryChart kind={kind} color="#888" rows={[]} />,
      );
      expect(html).toContain(
        kind === "missing" ? "Sin faltantes" : "Sin lotes a revisar",
      );
      expect(html).not.toContain("linear-gradient");
    }
  });
  it("makes trend details focusable without native title tooltips", () => {
    const html = renderToStaticMarkup(
      <DashboardMiniChart
        values={[0n, 2n]}
        labels={["Ayer: 0", "Hoy: 2"]}
        color="#888"
      />,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain("<title");
  });
});
