import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ReportCustomers,
  ReportInventory,
  ReportKpi,
  ReportMeta,
  ReportProducts,
  ReportProfitability,
  ReportPurchases,
} from "@gestion/contracts";
import { ReportProfitabilityContent } from "./report-profitability";
import { ReportProductsContent } from "./report-products";
import { ReportInventoryContent } from "./report-inventory";
import { ReportPurchasesContent } from "./report-purchases";
import { ReportCustomersContent } from "./report-customers";
import { ReportAccountsContent } from "./report-accounts";
import {
  agingOption,
  profitTrendOption,
  rotationOption,
} from "./lib/report-charts-tabs";

const kpi = (
  unit: ReportKpi["unit"],
  value: string,
  extra: Partial<ReportKpi> = {},
): ReportKpi => ({
  unit,
  available: true,
  value,
  previous: null,
  changePct: null,
  ...extra,
});

const meta = (
  report: ReportMeta["report"],
  warnings: string[] = [],
): ReportMeta => ({
  report,
  currency: "ARS",
  timezone: "America/Argentina/Buenos_Aires",
  from: "2026-10-01",
  to: "2026-10-31",
  comparison: "previous",
  previousFrom: "2026-08-31",
  previousTo: "2026-09-30",
  branchIds: ["b1", "b2"],
  generatedAt: "2026-11-05T12:00:00Z",
  dataQuality: { partial: warnings.length > 0, warnings },
});

const row = (id: string, name: string, margin: number, units = 5) => ({
  id,
  name,
  netSalesMinor: "100000",
  costMinor: String(100000 - margin * 1000),
  profitMinor: String(margin * 1000),
  marginPct: margin,
  units,
});

const noop = () => undefined;

describe("pestaña Rentabilidad", () => {
  const data: ReportProfitability = {
    meta: meta("profitability", ["El margen se calcula sobre el 75 %"]),
    kpis: {
      grossProfit: kpi("money", "180000", { estimated: true }),
      marginPct: kpi("percent", "60", { changePp: -20 }),
      costOfSales: kpi("money", "120000"),
      profitPerTicket: kpi("money", "60000"),
    },
    charts: {
      trendUnit: "day",
      trend: [
        {
          bucket: "2026-10-10",
          profitMinor: "180000",
          netSalesMinor: "300000",
          marginPct: 60,
        },
      ],
      products: [row("p1", "Ibuprofeno", 60), row("p2", "Shampoo", 12)],
      categories: [row("c1", "Analgésicos", 60), row("c2", "Higiene", 12)],
    },
    tables: {
      branches: [
        {
          ...row("b1", "Centro", 60),
          previousMarginPct: 80,
          changePp: -20,
          sharePct: 80,
        },
        {
          ...row("b2", "Norte", 30),
          previousMarginPct: 25,
          changePp: 5,
          sharePct: 20,
        },
      ],
      lowMargin: [row("p2", "Shampoo", 12)],
      marginTargetPct: 20,
      costCoveragePct: 75,
    },
  };

  it("muestra los KPIs, la lectura rápida y los márgenes bajos", () => {
    const html = renderToStaticMarkup(
      <ReportProfitabilityContent data={data} onGranularity={noop} />,
    );
    for (const text of [
      "Ganancia bruta estimada",
      "Margen bruto",
      "Vendiste",
      "Te costó la mercadería",
      "Ganaste (bruto)",
      "De cada $100 que vendés",
      "Producto que más ganancia deja",
      "Categoría con menor margen",
      "Productos bajo 20 % de margen",
      "Shampoo",
      "−20 pp",
      "+5 pp",
      "El margen se calcula sobre el 75 %",
    ])
      expect(html).toContain(text);
  });

  it("el gráfico combinado rotula los dos ejes", () => {
    const option = profitTrendOption(data.charts.trend, "day");
    expect(option.yAxis.map((axis) => axis.name)).toEqual([
      "Ganancia",
      "Margen %",
    ]);
  });
});

describe("pestaña Productos", () => {
  const product = {
    id: "p1",
    name: "Ibuprofeno 400",
    category: "Analgésicos",
    units: 30,
    netSalesMinor: "300000",
    profitMinor: "120000",
    marginPct: 40,
    stock: 60,
    rotation: 0.5,
  };
  const data: ReportProducts = {
    meta: meta("products"),
    kpis: {
      activeProducts: kpi("count", "501"),
      paretoProducts: kpi("count", "82"),
      staleProducts: kpi("count", "1"),
      lowStock: kpi("count", "19"),
    },
    charts: {
      top: [product],
      categories: [
        { id: "c1", name: "Analgésicos", value: "300000", sharePct: 100 },
      ],
      rotation: [product],
      pareto: [
        {
          name: "Ibuprofeno 400",
          valueMinor: "300000",
          cumulativePct: 75,
          abc: "A",
        },
        {
          name: "Shampoo",
          valueMinor: "100000",
          cumulativePct: 100,
          abc: "B",
        },
      ],
      abc: [
        { id: "A", products: 1, sharePct: 75 },
        { id: "B", products: 1, sharePct: 25 },
        { id: "C", products: 0, sharePct: 0 },
      ],
    },
    tables: {
      stale: [
        {
          id: "p9",
          name: "Crema vieja",
          category: null,
          stock: 4,
          stockValueMinor: "8000",
          lastSaleAt: null,
          daysWithoutSales: null,
        },
      ],
      staleDays: 30,
      pareto: { products: 82, ofProducts: 160, sharePct: 51.2 },
    },
  };

  it("destaca lo que concentra la venta y lo que está parado", () => {
    const html = renderToStaticMarkup(<ReportProductsContent data={data} />);
    for (const text of [
      "Concentran el 80 % de la venta",
      "82 de 160 productos",
      "Rotación contra margen",
      "Crema vieja",
      "Nunca vendido",
      "Valor a costo",
      "¿Qué productos sostienen el negocio?",
      "Imprescindibles",
      "Clasificación ABC.",
    ])
      expect(html).toContain(text);
  });

  it("rotación contra margen con líneas de corte visibles", () => {
    const option = rotationOption([product], "margin", {
      rotation: 0.5,
      y: 40,
    });
    expect(option.series[0]!.markLine.data).toHaveLength(2);
    expect(option.series[0]!.data).toEqual([[0.5, 40]]);
  });
});

describe("pestaña Inventario", () => {
  const data = (showsValue: boolean): ReportInventory => ({
    meta: meta("inventory"),
    kpis: {
      stockValue: showsValue ? kpi("money", "500000") : kpi("units", "120"),
      lowStock: kpi("count", "3"),
      outOfStock: kpi("count", "2"),
      expiringLots: kpi("count", "1"),
    },
    charts: {
      trendUnit: "day",
      trend: [
        {
          bucket: "2026-10-01",
          units: 100,
          valueMinor: showsValue ? "400000" : null,
        },
        {
          bucket: "2026-10-31",
          units: 120,
          valueMinor: showsValue ? "500000" : null,
        },
      ],
      categories: [
        {
          id: "c1",
          name: "Analgésicos",
          value: "500000",
          sharePct: 100,
          units: 120,
        },
      ],
      health: { healthy: 10, low: 3, out: 2, expiring: 1, expired: 1 },
      expiryByMonth: [
        {
          month: "expired",
          lots: 1,
          units: 3,
          valueMinor: showsValue ? "3000" : null,
        },
        {
          month: "2026-11",
          lots: 0,
          units: 0,
          valueMinor: showsValue ? "0" : null,
        },
      ],
    },
    tables: {
      expiring: [
        {
          lotId: "l1",
          product: "Amoxicilina",
          lot: "A1",
          branch: "Centro",
          expiresAt: "2026-10-20",
          quantity: 3,
          daysLeft: -16,
          valueMinor: showsValue ? "3000" : null,
        },
      ],
      critical: [
        {
          id: "p1",
          name: "Ibuprofeno",
          stock: 4,
          dailyUnits: 2,
          coverageDays: 2,
        },
      ],
      lowStockThreshold: 5,
      expiryWindowDays: 90,
      units: { sellable: 117, expired: 3 },
      showsValue,
    },
  });

  it("dice qué se acaba primero y separa los vencidos", () => {
    const html = renderToStaticMarkup(
      <ReportInventoryContent data={data(true)} onGranularity={noop} />,
    );
    for (const text of [
      "Valor del stock",
      "Lo primero que se acaba",
      "Alcanza 2 días",
      "Vencido hace 16",
      "Vencidos con existencia",
      "+25 %",
      "Salud del stock",
      "Sanos",
      "Con vencidos",
    ])
      expect(html).toContain(text);
  });

  it("sin permiso de costos muestra unidades y ningún valor", () => {
    const html = renderToStaticMarkup(
      <ReportInventoryContent data={data(false)} onGranularity={noop} />,
    );
    expect(html).toContain("Unidades en stock");
    expect(html).not.toContain("Valor del stock");
    expect(html).not.toContain("a costo");
  });
});

describe("pestaña Compras", () => {
  const data: ReportPurchases = {
    meta: meta("purchases"),
    kpis: {
      received: kpi("money", "300000"),
      activeSuppliers: kpi("count", "3"),
      pendingInvoices: kpi("count", "1"),
      costChange: kpi("percent", "4.2"),
    },
    charts: {
      trendUnit: "day",
      trend: [{ bucket: "2026-10-10", value: "300000", previous: "100000" }],
      suppliers: [
        { id: "s1", name: "Droguería Sur", value: "300000", sharePct: 100 },
      ],
      duesCalendar: [
        { id: "overdue", name: "Vencido", amountMinor: "50000", invoices: 1 },
        { id: "week", name: "Esta semana", amountMinor: "0", invoices: 0 },
      ],
    },
    tables: {
      invoicedMinor: "250000",
      pendingInvoices: [
        {
          id: "i1",
          supplier: "Droguería Sur",
          document: "FA 0001-123",
          issuedOn: "2026-09-01",
          dueOn: "2026-09-30",
          balanceMinor: "50000",
          daysOverdue: 36,
        },
      ],
      pendingTotals: { balanceMinor: "50000", overdueMinor: "50000" },
      costIncreases: [
        {
          id: "p1",
          name: "Ibuprofeno",
          previousCostMinor: "1000",
          currentCostMinor: "1200",
          changePct: 20,
        },
      ],
      pendingReceipts: [],
    },
  };

  it("separa recibido de facturado y marca la mora", () => {
    const html = renderToStaticMarkup(
      <ReportPurchasesContent
        data={data}
        comparison="previous"
        onGranularity={noop}
      />,
    );
    for (const text of [
      "Compras recibidas",
      "Facturado por proveedores",
      "Mayor aumento de costo",
      "Deuda vencida con proveedores",
      "36 d",
      "No hay mercadería pendiente de recibir.",
      "Calendario de pagos a proveedores",
      "Ya vencido",
    ])
      expect(html).toContain(text);
  });
});

describe("pestaña Clientes", () => {
  const data: ReportCustomers = {
    meta: meta("customers"),
    kpis: {
      activeCustomers: kpi("count", "12"),
      accountBalance: kpi("money", "100000"),
      collected: kpi("money", "30000"),
      debtors: kpi("count", "2"),
    },
    charts: {
      trendUnit: "day",
      trend: [
        {
          bucket: "2026-10-10",
          soldOnAccountMinor: "60000",
          collectedMinor: "30000",
          previousCollectedMinor: "10000",
        },
      ],
      topCustomers: [
        {
          id: "c1",
          name: "Beatriz Medina",
          value: "90000",
          sharePct: 60,
          tickets: 3,
        },
      ],
      aging: [
        { id: "current", name: "Al día", value: "60000" },
        { id: "31-60", name: "31 a 60 días", value: "40000" },
      ],
    },
    tables: {
      debtors: [
        {
          id: "c1",
          name: "Beatriz Medina",
          balanceMinor: "70000",
          overdueMinor: "40000",
          oldestDaysOverdue: 45,
          lastPaymentAt: "2026-10-10T15:00:00Z",
        },
      ],
      loyalty: {
        identifiedSharePct: 18.5,
        returningPct: 60,
        retentionPct: 40,
        newCustomers: 2,
        returningCustomers: 3,
        medianDaysBetween: 21,
        purchasesPerCustomer: 1.8,
        spendPerCustomerMinor: "45000",
        segments: [
          { id: "frequent", customers: 2, lifetimeMinor: "500000" },
          { id: "regular", customers: 1, lifetimeMinor: "90000" },
          { id: "new", customers: 2, lifetimeMinor: "40000" },
          { id: "atRisk", customers: 1, lifetimeMinor: "300000" },
          { id: "lost", customers: 0, lifetimeMinor: "0" },
        ],
        newVsReturning: [
          { bucket: "2026-10-10", newCount: 1, returningCount: 2 },
        ],
        frequency: [
          { id: "once", name: "Una sola compra", customers: 2 },
          { id: "30", name: "Cada mes", customers: 3 },
        ],
        cohorts: [
          { month: "2026-09", customers: 4, retention: [50, 25, null] },
        ],
        toRecover: [
          {
            id: "c9",
            name: "Rosa Díaz",
            lastPurchaseAt: "2026-09-01T15:00:00Z",
            daysSince: 60,
            usualDays: 20,
            purchases: 6,
            lifetimeMinor: "300000",
            segment: "atRisk",
          },
        ],
      },
      collections: [],
    },
  };

  it("Clientes mide la fidelidad y Cuentas corrientes la deuda, cada una en su pestaña", () => {
    const loyaltyHtml = renderToStaticMarkup(
      <ReportCustomersContent
        data={data}
        comparison="previous"
        onGranularity={noop}
      />,
    );
    for (const text of [
      "Recompra",
      "Retención",
      "Compran cada (días)",
      "18,5 %",
      "Frecuentes",
      "En riesgo",
      "Rosa Díaz",
      "cada 20 d",
      "¿Vuelven los que llegan?",
    ])
      expect(loyaltyHtml).toContain(text);
    expect(loyaltyHtml).not.toContain("Fiado y cobrado");
    const html = renderToStaticMarkup(
      <ReportAccountsContent
        data={data}
        comparison="previous"
        onGranularity={noop}
      />,
    );
    for (const text of [
      "Cobrado sobre lo fiado",
      "50 %",
      "la deuda sube",
      "Deuda vencida",
      "Parte vencida del saldo",
      "45 d",
      "Sin cobros en el período.",
    ])
      expect(html).toContain(text);
    // Nunca datos personales en la vista general.
    expect(html).not.toMatch(/DNI|CUIT|Tel[eé]fono/);
  });

  it("la antigüedad colorea de verde a rojo según el atraso", () => {
    const option = agingOption(data.charts.aging);
    const colors = option.series[0]!.data.map((item) => item.itemStyle.color);
    expect(colors[0]).not.toBe(colors[1]);
  });
});
