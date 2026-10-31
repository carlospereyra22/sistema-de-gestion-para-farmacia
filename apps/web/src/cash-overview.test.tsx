import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CashMovements, CashOverview } from "./cash-overview";
import type { CashSession } from "./lib/api";

const session: CashSession = {
  id: "session",
  cashRegisterId: "register",
  openedAt: "2026-10-06T13:00:00Z",
  closedAt: null,
  openingAmountMinor: "10000",
  closingAmountMinor: null,
  cashSalesMinor: "50000",
  manualInMinor: "2000",
  manualOutMinor: "1000",
  expectedAmountMinor: "61000",
  differenceMinor: null,
  movements: Array.from({ length: 7 }, (_, index) => ({
    id: String(index),
    type: index % 2 ? "OUT" : "IN",
    amountMinor: "1000",
    reason: `Movimiento ${index}`,
    createdAt: `2026-10-06T13:0${index}:00Z`,
  })),
};

it("shows server session totals without calling them daily totals", () => {
  const html = renderToStaticMarkup(
    <CashOverview session={session} registerName="Central" />,
  );
  expect(html).toContain("Resumen de la sesión");
  expect(html).toContain("610,00");
  expect(html).toContain("520,00");
  expect(html).toContain("Ingresos");
  expect(html).toContain("Saldo esperado");
  expect(html).toContain("10,00");
  expect(html).toContain("Central");
  expect(html).not.toContain("Resumen del día");
});

it("shows five most recent movements without mutating the session", () => {
  const html = renderToStaticMarkup(<CashMovements session={session} />);
  expect(html).toContain("Movimiento 6");
  expect(html).toContain("Movimiento 2");
  expect(html).not.toContain("Movimiento 1");
  expect(html).toContain("Ver todos");
  expect(html.indexOf("Movimiento 6")).toBeLessThan(
    html.indexOf("Movimiento 5"),
  );
  expect(session.movements[0]?.id).toBe("0");
});

it("does not invent balances or movements when there is no open session", () => {
  const html = renderToStaticMarkup(
    <>
      <CashOverview />
      <CashMovements />
    </>,
  );
  expect(html).toContain("Caja cerrada");
  expect(html).toContain("Sin sesión");
  expect(html).toContain("Los movimientos aparecerán al abrir una caja.");
  expect(html).not.toContain("NaN");
});

it("shows an empty state for a session without movements", () => {
  const html = renderToStaticMarkup(
    <CashMovements session={{ ...session, movements: [] }} />,
  );
  expect(html).toContain("Todavía no hay movimientos");
  expect(html).not.toContain("Ver todos");
});

it("shows the latest-closure slot only while the register is closed", () => {
  const details = <p>Último cierre de Central</p>;
  expect(
    renderToStaticMarkup(<CashOverview closedDetails={details} />),
  ).not.toContain("Efectivo esperado");
  expect(
    renderToStaticMarkup(<CashOverview closedDetails={details} />),
  ).toContain("Último cierre de Central");
  expect(
    renderToStaticMarkup(
      <CashOverview session={session} closedDetails={details} />,
    ),
  ).not.toContain("Último cierre de Central");
});
