import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportKpi, ReportOverview } from "@gestion/contracts";
import { ReportOverviewContent } from "./report-overview";
import { ReportCashClosuresPanel } from "./report-cash-closures";

const money = (value: string, previous: string | null = null): ReportKpi => ({
  unit: "money",
  available: true,
  value,
  previous,
  changePct: previous ? 100 : null,
});

const overview = (
  patch: Partial<ReportOverview["kpis"]> = {},
): ReportOverview => ({
  meta: {
    report: "summary",
    currency: "ARS",
    timezone: "America/Argentina/Buenos_Aires",
    from: "2026-10-01",
    to: "2026-10-31",
    comparison: "previous",
    previousFrom: "2026-08-31",
    previousTo: "2026-09-30",
    branchIds: ["b1", "b2"],
    generatedAt: "2026-11-05T12:00:00Z",
    dataQuality: { partial: false, warnings: [] },
  },
  kpis: {
    netSales: money("400000", "200000"),
    grossProfit: { ...money("180000"), estimated: true },
    averageTicket: money("166700"),
    unitsSold: { ...money("3"), unit: "units" },
    ...patch,
  },
  charts: {
    trendGranularity: "day",
    salesTrend: [{ bucket: "2026-10-10", value: "400000", previous: "0" }],
    salesByCategory: [
      { id: "c1", name: "Analgésicos", value: "300000", sharePct: 75 },
    ],
    paymentMethods: [
      { id: "CASH", name: "CASH", value: "150000", sharePct: 30 },
      { id: "ACCOUNT", name: "ACCOUNT", value: "100000", sharePct: 20 },
    ],
    topProducts: [
      {
        id: "p1",
        name: "Producto A",
        value: "300000",
        sharePct: 75,
        units: 3,
      },
    ],
  },
  tables: {
    branches: [
      {
        id: "b1",
        name: "Centro",
        netSalesMinor: "300000",
        grossProfitMinor: "180000",
        tickets: 2,
        unitsSold: 3,
        sharePct: 75,
      },
      {
        id: "b2",
        name: "Norte",
        netSalesMinor: "100000",
        grossProfitMinor: "0",
        tickets: 1,
        unitsSold: 0,
        sharePct: 25,
      },
    ],
    alerts: [
      { kind: "expired", count: 0, threshold: 0 },
      { kind: "expiring", count: 2, threshold: 90 },
      { kind: "lowStock", count: 1, threshold: 5 },
    ],
    cashClosures: {
      count: 0,
      expectedMinor: "0",
      countedMinor: "0",
      differenceMinor: "0",
      daily: [],
      monthly: [],
    },
  },
});

const render = (data: ReportOverview) =>
  renderToStaticMarkup(
    <ReportOverviewContent
      data={data}
      comparison="previous"
      onOpenInventory={() => undefined}
    />,
  );

describe("report overview", () => {
  it("muestra las cuatro tarjetas, medios en espanol y la tabla con total", () => {
    const html = render(overview());
    for (const text of [
      "Ventas netas",
      "Ganancia bruta estimada",
      "estimado",
      "Ticket promedio",
      "Unidades vendidas",
      "Total facturado",
      "Centro",
      "Norte",
      "Total",
      "Cierres de caja (0)",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain(">CASH<");
  });

  it("sin permiso de costos oculta la ganancia y su columna", () => {
    const html = render(
      overview({
        grossProfit: {
          unit: "money",
          available: false,
          unavailableReason: "FORBIDDEN",
          value: null,
          previous: null,
          changePct: null,
        },
      }),
    );
    expect(html).not.toContain("Ganancia bruta estimada");
    expect(html).not.toContain("Ganancia est.");
  });

  it("con una sola sucursal no repite la tabla por sucursal", () => {
    const data = overview();
    data.tables.branches = data.tables.branches.slice(0, 1);
    const html = render(data);
    expect(html).not.toContain("Resumen por sucursal");
    expect(html).toContain("Alertas de inventario");
    expect(render(overview())).toContain("Resumen por sucursal");
  });

  it("solo muestra las alertas con cantidad", () => {
    const html = render(overview());
    expect(html).toContain("2 lotes vencen en 90 días");
    expect(html).toContain("1 producto con stock bajo");
    expect(html).not.toContain("vencidos con existencia");
  });

  it("sin ventas explica en vez de dibujar ceros", () => {
    const html = render(
      overview({
        netSales: money("0"),
        unitsSold: { ...money("0"), unit: "units" },
      }),
    );
    expect(html).toContain("Sin ventas para el período");
    expect(html).not.toContain("Evolución de ventas");
  });
});

describe("report cash closures", () => {
  it("pagina por dia y muestra primero lo mas reciente", () => {
    const daily = Array.from({ length: 25 }, (_, index) => ({
      period: `2026-10-${String(index + 1).padStart(2, "0")}`,
      count: 1,
      expectedMinor: "1000",
      countedMinor: "1000",
      differenceMinor: "0",
    }));
    const html = renderToStaticMarkup(
      <ReportCashClosuresPanel
        closures={{
          count: 25,
          expectedMinor: "25000",
          countedMinor: "25000",
          differenceMinor: "0",
          daily,
          monthly: [{ ...daily[0]!, period: "2026-10", count: 25 }],
        }}
      />,
    );
    expect(html.match(/<tr class="border-t/g)).toHaveLength(11);
    expect(html.indexOf("25/10/2026")).toBeLessThan(html.indexOf("24/10/2026"));
    expect(html).not.toContain("15/10/2026");
    expect(html).toContain("25 días · 10 por página");
  });
});
