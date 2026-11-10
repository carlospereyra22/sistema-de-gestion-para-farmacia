import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DashboardInventoryAlerts,
  DashboardOverview,
} from "./dashboard-overview";
import { dashboardMetrics } from "./lib/dashboard-metrics";

const summary = {
  salesTodayCount: 8,
  salesTodayMinor: "1234567",
  averageTicketMinor: "154320",
  customerReceivables: { count: 2, totalMinor: "50000" },
  supplierDebt: {
    count: 1,
    totalMinor: "90000",
    overdueMinor: "0",
    todayMinor: "0",
    next7Minor: "30000",
    nextDueOn: "2026-11-12",
  },
  stockLots: 4,
  stockUnits: 40,
  expiringLots: 0,
  pendingPurchases: 3,
  openCashSessions: 1,
};

describe("indicadores de Inicio", () => {
  it("muestra las seis KPI con la grilla compacta y sin accesos rápidos", () => {
    const html = renderToStaticMarkup(
      <DashboardOverview metrics={dashboardMetrics(summary, undefined)} />,
    );
    for (const label of [
      "Ventas hoy",
      "Ticket promedio",
      "A cobrar en cuentas corrientes",
      "Caja",
      "Deuda con proveedores",
      "Compras por recibir",
      "8 tickets",
      "2 clientes con deuda",
      "Cerrada",
    ])
      expect(html).toContain(label);
    expect(html.match(/<article/g)).toHaveLength(6);
    expect(html).toContain("2xl:grid-cols-6");
    expect(html).not.toContain("Accesos rápidos");
    expect(html).not.toContain("<button");
  });

  it("muestra la curva de ventas solo con una serie real", () => {
    const html = renderToStaticMarkup(
      <DashboardOverview
        metrics={dashboardMetrics(summary, undefined)}
        salesTrend={[
          { date: "2026-11-09", totalMinor: "1000000", count: 6 },
          { date: "2026-11-10", totalMinor: "1234567", count: 8 },
        ]}
      />,
    );
    expect(html).toContain("vs. ayer");
    expect(html).toContain("8 tickets");
    expect(html.match(/role="img"/g)).toHaveLength(1);
  });

  it("mientras carga muestra esqueletos del mismo tamaño y no valores", () => {
    const html = renderToStaticMarkup(
      <DashboardOverview
        metrics={dashboardMetrics(undefined, undefined)}
        loading
      />,
    );
    expect(html.match(/dashboard-skeleton/g)).toHaveLength(12);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain(">—<");
    expect(html).not.toContain("Cerrada");
    expect(html.match(/dashboard-entrada/g)).toHaveLength(6);
  });

  it("un importe nunca se parte en dos líneas", () => {
    const html = renderToStaticMarkup(
      <DashboardOverview metrics={dashboardMetrics(summary, undefined)} />,
    );
    expect(html).toContain("whitespace-nowrap");
    expect(html).not.toContain("break-words");
  });

  it("sin resumen no inventa valores", () => {
    const html = renderToStaticMarkup(
      <DashboardOverview metrics={dashboardMetrics(undefined, undefined)} />,
    );
    expect(html.match(/>—</g)).toHaveLength(5);
    expect(html).not.toContain("vs. ayer");
  });
});

describe("alertas de inventario de Inicio", () => {
  const counts = { out: 3, low: 0, expiring: 1, expired: 0 };

  it("usa los contadores de Productos y marca los que están en cero", () => {
    const html = renderToStaticMarkup(
      <DashboardInventoryAlerts counts={counts} onNavigate={vi.fn()} />,
    );
    for (const text of [
      "Sin stock",
      "Stock bajo",
      "Por vencer (90 días)",
      "Vencidos",
      "3 productos",
      "1 producto",
      "Sin productos",
    ])
      expect(html).toContain(text);
  });

  it("cada fila lleva a Inventario", () => {
    const onNavigate = vi.fn();
    function clickButtons(node: ReactNode) {
      Children.forEach(node, (child) => {
        if (
          !isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)
        )
          return;
        if (child.type === "button") child.props.onClick?.();
        clickButtons(child.props.children);
      });
    }
    clickButtons(DashboardInventoryAlerts({ counts, onNavigate }));
    expect(onNavigate.mock.calls).toEqual([
      ["Inventario"],
      ["Inventario"],
      ["Inventario"],
      ["Inventario"],
    ]);
  });
});
