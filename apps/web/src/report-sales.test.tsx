import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportKpi, ReportSales } from "@gestion/contracts";
import { ReportSalesContent } from "./report-sales";
import {
  heatmapOption,
  hourRange,
  salesTrendOption,
  weekdayName,
} from "./lib/report-charts-ventas";
import { bucketLabel } from "./lib/report-charts";

const kpi = (
  unit: ReportKpi["unit"],
  value: string,
  previous: string | null = null,
  changePct: number | null = null,
): ReportKpi => ({ unit, available: true, value, previous, changePct });

const hours = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  amountMinor: hour === 10 ? "400000" : hour === 23 ? "100000" : "0",
  tickets: hour === 10 ? 2 : hour === 23 ? 1 : 0,
  previousAmountMinor: hour === 9 ? "200000" : "0",
}));

const sales = (branches = 2): ReportSales => ({
  meta: {
    report: "sales",
    currency: "ARS",
    timezone: "America/Argentina/Buenos_Aires",
    from: "2026-10-01",
    to: "2026-10-31",
    comparison: "previous",
    previousFrom: "2026-08-31",
    previousTo: "2026-09-30",
    branchIds: ["b1", "b2"].slice(0, branches),
    generatedAt: "2026-11-05T12:00:00Z",
    dataQuality: { partial: false, warnings: [] },
  },
  kpis: {
    netSales: kpi("money", "400000", "200000", 100),
    tickets: kpi("count", "3", "1", 200),
    averageTicket: kpi("money", "166700"),
    unitsSold: kpi("units", "3", "1", 200),
  },
  charts: {
    trendUnit: "day",
    trend: [
      {
        bucket: "2026-10-10",
        value: "300000",
        previous: "200000",
        tickets: 1,
        previousTickets: 1,
      },
    ],
    branchTrend:
      branches > 1
        ? [
            { id: "b1", name: "Centro", values: ["300000"] },
            { id: "b2", name: "Norte", values: ["100000"] },
          ]
        : [],
    byHour: hours,
    heatmap: [
      { weekday: 6, hour: 10, amountMinor: "300000", tickets: 1 },
      { weekday: 2, hour: 10, amountMinor: "100000", tickets: 1 },
    ],
    paymentMethods: [
      { id: "CASH", name: "CASH", value: "150000", sharePct: 30 },
      { id: "CARD", name: "CARD", value: "350000", sharePct: 70 },
    ],
    topProducts: [
      {
        id: "p1",
        name: "Ibuprofeno 400",
        value: "300000",
        sharePct: 75,
        units: 3,
      },
    ],
    ticketSizes: [
      { id: "5k", name: "Hasta $5.000", tickets: 2, amountMinor: "600000" },
      {
        id: "10k",
        name: "$5.000 a $10.000",
        tickets: 1,
        amountMinor: "900000",
      },
    ],
    weekdayAverage: [
      { weekday: 2, averageMinor: "25000", days: 4 },
      { weekday: 6, averageMinor: "100000", days: 5 },
    ],
    categories: [
      {
        id: "c1",
        name: "Analgésicos",
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
        previousNetSalesMinor: "200000",
        changePct: 50,
        tickets: 2,
        averageTicketMinor: "200000",
        unitsSold: 2,
        sharePct: 75,
      },
      {
        id: "b2",
        name: "Norte",
        netSalesMinor: "100000",
        previousNetSalesMinor: "0",
        changePct: null,
        tickets: 1,
        averageTicketMinor: "100000",
        unitsSold: 1,
        sharePct: 25,
      },
    ].slice(0, branches),
    insights: {
      peakHour: { hour: 10, amountMinor: "400000", sharePct: 80 },
      bestWeekday: { weekday: 6, amountMinor: "400000", sharePct: 80 },
      topBranch:
        branches > 1 ? { id: "b1", name: "Centro", sharePct: 75 } : null,
      discounts: kpi("money", "5000", "0"),
      returns: kpi("money", "100000", "0"),
      returnRatePct: 20,
      unitsPerTicket: 1,
    },
  },
});

const render = (data: ReportSales) =>
  renderToStaticMarkup(
    <ReportSalesContent
      data={data}
      comparison="previous"
      onGranularity={() => undefined}
    />,
  );

describe("pestaña Ventas (SISTEMA-115)", () => {
  it("muestra los cuatro KPIs y la lectura rápida del período", () => {
    const html = render(sales());
    for (const text of [
      "Ventas netas",
      "Tickets",
      "Ticket promedio",
      "Unidades vendidas",
      "Hora pico",
      "¿Cuánto se gasta por compra?",
      "Venta promedio por día de la semana",
      "10 h a 11 h",
      "Día más fuerte",
      "Sábado",
      "Sucursal que más vende",
      "Centro",
      "Devoluciones",
      "20 %",
    ])
      expect(html).toContain(text);
  });

  it("arriba la evolución con los productos más vendidos; el mapa de calor, después", () => {
    const html = render(sales());
    const evolution = html.indexOf("Evolución de ventas");
    const products = html.indexOf("Productos más vendidos");
    const heatmap = html.indexOf("¿Cuándo se vende?");
    expect(evolution).toBeLessThan(products);
    expect(products).toBeLessThan(heatmap);
  });

  it("con varias sucursales ofrece la evolución por sucursal y la tabla comparativa", () => {
    const html = render(sales());
    expect(html).toContain("Por sucursal");
    expect(html).toContain("Detalle por sucursal");
    expect(html).toContain("+50 %");
    expect(html).toContain('aria-label="Agrupar la evolución por"');
  });

  it("con una sola sucursal no repite la tabla ni la sucursal líder", () => {
    const html = render(sales(1));
    expect(html).not.toContain("Por sucursal");
    expect(html).not.toContain("Detalle por sucursal");
    expect(html).not.toContain("Sucursal que más vende");
  });

  it("sin ventas muestra el estado vacío y no los gráficos", () => {
    const data = sales();
    data.kpis.tickets = kpi("count", "0");
    const html = render(data);
    expect(html).toContain("Sin ventas para el período");
    expect(html).not.toContain("Lectura rápida");
  });
});

describe("gráficos de Ventas", () => {
  it("las horas se recortan a las que tienen ventas en algún período", () => {
    const visible = hourRange(hours);
    expect(visible[0]?.hour).toBe(9);
    expect(visible.at(-1)?.hour).toBe(23);
  });

  it("el mapa de calor pone el lunes arriba y suma tickets al detalle", () => {
    const option = heatmapOption(sales().charts.heatmap);
    expect(option.yAxis.data[0]).toBe("Dom");
    expect(option.yAxis.data.at(-1)).toBe("Lun");
    expect(option.xAxis.data).toEqual(["10 h"]);
    expect(option.series[0]!.data[0]!.tickets).toBe(1);
    expect(weekdayName(6)).toBe("Sábado");
  });

  it("la evolución muestra tickets en el detalle y etiqueta semanas", () => {
    const option = salesTrendOption(
      sales().charts.trend,
      "week",
      "Período anterior",
    );
    const detail = option.tooltip.formatter([
      {
        seriesName: "Período actual",
        value: 300000,
        marker: "",
        dataIndex: 0,
      },
    ]);
    expect(detail).toContain("1 ticket");
    expect(bucketLabel("2026-10-05", "week")).toBe("sem 05/10");
  });
});
