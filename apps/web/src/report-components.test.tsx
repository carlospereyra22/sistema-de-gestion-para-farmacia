import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportKpiCard } from "./report-kpi";
import { ReportFiltersBar } from "./report-filters-bar";
import { ReportEmptyState, ReportSkeleton } from "./report-states";
import { ReportsWorkspace } from "./reports-workspace";
import { isTabAllowed } from "./lib/report-view";
import { defaultReportView } from "./lib/report-view";

const today = "2026-10-31";
const noop = () => undefined;

describe("report components", () => {
  it("la tarjeta muestra valor, variacion y ayuda de la formula", () => {
    const html = renderToStaticMarkup(
      <ReportKpiCard
        label="Ventas netas"
        icon={null}
        help="Ventas confirmadas menos devoluciones."
        kpi={{
          unit: "money",
          available: true,
          value: "198000",
          previous: "100000",
          changePct: 98,
        }}
      />,
    );
    expect(html).toContain("Ventas netas");
    expect(html).toContain("1.980,00");
    expect(html).toContain("+98,0 %");
    expect(html).toContain("vs. período anterior");
    expect(html).toContain("Cómo se calcula: Ventas confirmadas");
  });

  it("la tarjeta sin dato dice No disponible, no cero", () => {
    const html = renderToStaticMarkup(
      <ReportKpiCard
        label="Vendedor"
        icon={null}
        help="x"
        kpi={{
          unit: "count",
          available: false,
          unavailableReason: "NOT_RECORDED",
          value: null,
          previous: null,
          changePct: null,
        }}
      />,
    );
    expect(html).toContain("No disponible");
    expect(html).toContain("Sin base de comparación");
    expect(html).not.toContain(">0<");
  });

  it("con una sucursal muestra su nombre sin desplegable", () => {
    const html = renderToStaticMarkup(
      <ReportFiltersBar
        view={defaultReportView(today)}
        branches={[{ id: "b1", name: "Casa Central" }]}
        today={today}
        onChange={noop}
        onReset={noop}
      />,
    );
    expect(html).toContain("Casa Central");
    expect(html).not.toContain("Todas las sucursales");
    expect(html).not.toContain('aria-label="Sucursal" aria-haspopup');
    expect(html).toContain("Últimos 30 días");
    expect(html).toContain("Período anterior");
    // Desplegables del sistema, no el select nativo del navegador.
    expect(html).not.toContain("<select");
    expect(html.match(/role="combobox"/g)).toHaveLength(2);
  });

  it("las fechas se pueden editar sin elegir Personalizado", () => {
    const html = renderToStaticMarkup(
      <ReportFiltersBar
        view={defaultReportView(today)}
        branches={[{ id: "b1", name: "Casa Central" }]}
        today={today}
        onChange={noop}
        onReset={noop}
      />,
    );
    expect(html).toContain('aria-label="Desde"');
    expect(html).toContain('value="2026-10-02"');
    expect(html).not.toContain("disabled");
  });

  it("con dos sucursales ofrece Todas las sucursales", () => {
    const html = renderToStaticMarkup(
      <ReportFiltersBar
        view={defaultReportView(today)}
        branches={[
          { id: "b1", name: "Centro" },
          { id: "b2", name: "Norte" },
        ]}
        today={today}
        onChange={noop}
        onReset={noop}
      />,
    );
    expect(html).toContain("Todas las sucursales");
    expect(html.match(/role="combobox"/g)).toHaveLength(3);
  });

  it("muestra las 7 pestanas y carga sin numeros inventados", () => {
    const html = renderToStaticMarkup(
      <ReportsWorkspace
        token="t"
        organizationId="o"
        currentBranchId="b1"
        search={new URLSearchParams("pagina=reportes&seccion=ventas")}
        onSearchChange={noop}
      />,
    );
    for (const label of [
      "Resumen",
      "Ventas",
      "Rentabilidad",
      "Productos",
      "Inventario",
      "Compras",
      "Clientes",
    ])
      expect(html).toContain(label);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Cargando reportes");
    expect(html).not.toContain("$");
  });

  it("las pestanas restringidas dependen del permiso", () => {
    const none = {
      profitability: false,
      purchases: false,
      customers: false,
      export: false,
    };
    expect(isTabAllowed("sales", none)).toBe(true);
    expect(isTabAllowed("profitability", none)).toBe(false);
    expect(
      isTabAllowed("profitability", { ...none, profitability: true }),
    ).toBe(true);
    expect(isTabAllowed("customers", none)).toBe(false);
  });

  it("los estados vacio y de carga son accesibles", () => {
    expect(
      renderToStaticMarkup(<ReportEmptyState title="Sin ventas" />),
    ).toContain('role="status"');
    expect(renderToStaticMarkup(<ReportSkeleton />)).toContain(
      'aria-busy="true"',
    );
  });
});
