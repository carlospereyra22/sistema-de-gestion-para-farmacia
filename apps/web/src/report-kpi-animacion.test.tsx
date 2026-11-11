import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportKpi } from "@gestion/contracts";
import { ReportKpiCard } from "./report-kpi";
import { ReportCashClosuresPanel } from "./report-cash-closures";

// Intl separa "$" del número con un espacio no separable.
const render = (elemento: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(elemento).replaceAll(String.fromCharCode(160), " ");

const kpi: ReportKpi = {
  unit: "money",
  available: true,
  value: "251616500",
  previous: "133000000",
  changePct: 88.6,
};

it("con la entrada animada el número arranca en 0; sin ella, el valor final (SISTEMA-87)", () => {
  const animada = render(
    <ReportKpiCard label="Ventas netas" icon={null} kpi={kpi} help="" animar />,
  );
  // Lo que se ve arranca en 0; el lector de pantalla lee sólo el valor final.
  expect(animada).toContain('<span aria-hidden="true">$ 0,00</span>');
  expect(animada).toContain('<span class="sr-only">$ 2.516.165,00</span>');
  // Hasta entrar en pantalla la tarjeta espera invisible (data-entrada).
  expect(animada).toContain('data-entrada="pendiente"');
  const directa = render(
    <ReportKpiCard label="Ventas netas" icon={null} kpi={kpi} help="" />,
  );
  expect(directa).toContain("2.516.165,00");
  expect(directa).not.toContain("sr-only");
  expect(directa).toContain('data-entrada="lista"');
  // La variación contra el período anterior se ve igual desde el principio.
  expect(animada).toContain("88,6");
});

it("unidades y valor 0 no se animan de más (SISTEMA-90)", () => {
  const unidades = render(
    <ReportKpiCard
      label="Unidades vendidas"
      icon={null}
      kpi={{ ...kpi, unit: "units", value: "42" }}
      help=""
      animar
    />,
  );
  expect(unidades).toContain('<span class="sr-only">42</span>');
  // Un 0 real se muestra directo: no hay recorrido que animar.
  const cero = render(
    <ReportKpiCard
      label="Ventas netas"
      icon={null}
      kpi={{ ...kpi, value: "0" }}
      help=""
      animar
    />,
  );
  expect(cero).toContain("$ 0,00");
  expect(cero).not.toContain("sr-only");
});

it("los totales de cierres cuentan, con signo; las tablas no (SISTEMA-90)", () => {
  const html = render(
    <ReportCashClosuresPanel
      animar
      closures={{
        count: 1,
        expectedMinor: "7516800",
        countedMinor: "12509200",
        differenceMinor: "-4992400",
        daily: [
          {
            period: "2026-10-12",
            count: 1,
            expectedMinor: "7516800",
            countedMinor: "12509200",
            differenceMinor: "-4992400",
          },
        ],
        monthly: [],
      }}
    />,
  );
  expect(html).toContain('<span class="sr-only">-$ 49.924,00</span>');
  // La tabla muestra la cifra exacta desde el principio.
  expect(html).toMatch(/<td[^>]*text-rose-600[^>]*>-\$ 49\.924,00<\/td>/);
});
