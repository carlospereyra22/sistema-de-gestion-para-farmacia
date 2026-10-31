import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardOverview } from "./dashboard-overview";

const props = {
  sales: "$ 12.345,67",
  tickets: "8",
  outOfStock: 3,
  expiring: 1,
  alerts: [
    {
      title: "3 productos sin stock",
      status: "Crítico",
      tone: "bg-rose-100 text-rose-700",
    },
    {
      title: "1 lote vence dentro de 30 días",
      status: "Revisar",
      tone: "bg-amber-100 text-amber-800",
    },
    {
      title: "No hay compras pendientes",
      status: "Normal",
      tone: "bg-emerald-100 text-emerald-700",
    },
  ],
  onNavigate: vi.fn(),
};

describe("dashboard overview", () => {
  it("shows the supplied metrics without inventing trends or changing values", () => {
    const html = renderToStaticMarkup(<DashboardOverview {...props} />);
    for (const label of [
      "Ventas hoy",
      "$ 12.345,67",
      "Tickets",
      "Sin stock",
      "Vencen pronto",
      "30 días",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain("Stock bajo");
    expect(html.match(/<article/g)).toHaveLength(4);
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("lucide-banknote");
  });
  it("retains normal information but reserves status badges for actionable alerts", () => {
    const html = renderToStaticMarkup(<DashboardOverview {...props} />);
    for (const alert of props.alerts) expect(html).toContain(alert.title);
    expect(html).toContain(">Crítico<");
    expect(html).toContain(">Revisar<");
    expect(html).not.toContain(">Normal<");
    expect(html).toContain("lucide-circle-check");
  });
  it("preserves missing summary placeholders and zero inventory counts", () => {
    const html = renderToStaticMarkup(
      <DashboardOverview
        {...props}
        sales="—"
        tickets="—"
        outOfStock={0}
        expiring={0}
        alerts={[]}
      />,
    );
    expect(html.match(/>—</g)).toHaveLength(2);
    expect(html.match(/>0</g)).toHaveLength(2);
    expect(html).not.toContain("Crítico");
  });
  it("routes eight shortcuts to existing modules", () => {
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
    clickButtons(DashboardOverview({ ...props, onNavigate }));
    expect(onNavigate.mock.calls).toEqual([
      ["Ventas"],
      ["Compras"],
      ["Clientes"],
      ["Cuentas corrientes"],
      ["Transferencias"],
      ["Inventario"],
      ["Caja"],
      ["Reportes"],
    ]);
  });
  it("includes actionable alerts without inventing trends or unavailable modules", () => {
    const html = renderToStaticMarkup(
      <DashboardOverview
        {...props}
        alerts={[
          {
            ...props.alerts[0]!,
            note: "Revisá existencias.",
            view: "Inventario",
          },
        ]}
      />,
    );
    expect(html).toContain("Revisá existencias.");
    expect(html).not.toContain("vs. ayer");
    expect(html).not.toContain("Recetas");
  });
});
