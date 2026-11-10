import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportKpi } from "@gestion/contracts";
import { ReportKpiCard } from "./report-kpi";

const kpi: ReportKpi = {
  unit: "money",
  available: true,
  value: "251616500",
  previous: "133000000",
  changePct: 88.6,
};

it("con la entrada animada el número arranca en 0; sin ella, el valor final (SISTEMA-87)", () => {
  const animada = renderToStaticMarkup(
    <ReportKpiCard label="Ventas netas" icon={null} kpi={kpi} help="" animar />,
  );
  expect(animada).toContain("0,00");
  expect(animada).not.toContain("2.516.165,00");
  const directa = renderToStaticMarkup(
    <ReportKpiCard label="Ventas netas" icon={null} kpi={kpi} help="" />,
  );
  expect(directa).toContain("2.516.165,00");
  // La variación contra el período anterior se ve igual desde el principio.
  expect(animada).toContain("88,6");
});
