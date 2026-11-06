import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CashMetrics, CashStatusBar, CashTimeline } from "./cash-overview";
import type { CashSession } from "./lib/api";

const session: CashSession = {
  id: "session",
  cashRegisterId: "register",
  openedAt: "2026-10-06T13:00:00Z",
  closedAt: null,
  openedBy: "Carlos",
  openingAmountMinor: "10000",
  closingAmountMinor: null,
  cashSalesMinor: "50000",
  saleChangeMinor: "0",
  cardMinor: "30000",
  transferMinor: "12500",
  manualInMinor: "2000",
  manualOutMinor: "1000",
  expectedAmountMinor: "61000",
  differenceMinor: null,
  movements: [
    {
      id: "in",
      type: "IN",
      category: "MANUAL",
      amountMinor: "2000",
      reason: "Cambio",
      createdAt: "2026-10-06T13:01:00Z",
    },
    {
      id: "out",
      type: "OUT",
      category: "MANUAL",
      amountMinor: "1000",
      reason: "Limpieza",
      createdAt: "2026-10-06T13:02:00Z",
    },
  ],
  cashPayments: [
    {
      id: "pago",
      saleId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      amountMinor: "50000",
      createdAt: "2026-10-06T13:03:00Z",
    },
  ],
};

const bar = (
  props: Partial<Parameters<typeof CashStatusBar>[0]> = {},
): string =>
  renderToStaticMarkup(<CashStatusBar onPending={vi.fn()} {...props} />);

it("muestra los totales de la sesión con tarjeta y transferencia aparte", () => {
  const html = renderToStaticMarkup(<CashMetrics session={session} />);
  expect(html).toContain("Efectivo esperado");
  expect(html).toContain("610,00");
  expect(html).toContain("Efectivo cobrado");
  expect(html).toContain("500,00");
  expect(html).toContain("300,00");
  expect(html).toContain("125,00");
  expect(html).toContain("Fondo");
  expect(html).toContain("Salidas");
  expect(html).not.toContain("Resumen del día");
});

it("la línea de tiempo incluye las ventas y no modifica la sesión", () => {
  const html = renderToStaticMarkup(<CashTimeline session={session} />);
  expect(html).toContain("Venta · 0f8fad5b");
  expect(html.indexOf("Venta · 0f8fad5b")).toBeLessThan(
    html.indexOf("Limpieza"),
  );
  expect(html.indexOf("Limpieza")).toBeLessThan(html.indexOf("Cambio"));
  expect(session.movements[0]?.id).toBe("in");
});

it("usa la misma lista con desplazamiento interno con o sin movimientos", () => {
  for (const current of [
    session,
    { ...session, movements: [], cashPayments: [] },
  ])
    expect(renderToStaticMarkup(<CashTimeline session={current} />)).toContain(
      "cash-movements-list",
    );
  expect(
    renderToStaticMarkup(
      <CashTimeline
        session={{ ...session, movements: [], cashPayments: [] }}
      />,
    ),
  ).toContain("Todavía no hay movimientos");
});

it("sin sesión mantiene Últimos movimientos a la vista", () => {
  const html = renderToStaticMarkup(<CashTimeline />);
  expect(html).toContain("Últimos movimientos");
  expect(html).toContain("Los movimientos aparecerán al abrir una caja.");
});

it("con la caja cerrada muestra los últimos 7 días con fecha", () => {
  const html = renderToStaticMarkup(
    <CashTimeline
      recent={{
        activity: {
          movements: session.movements,
          cashPayments: session.cashPayments,
        },
      }}
    />,
  );
  expect(html).toContain("de los últimos 7 días.");
  expect(html).toContain("Fecha");
  expect(html).toContain("Venta · 0f8fad5b");
  expect(html).toContain("Limpieza");
});

it("informa los estados de la actividad reciente", () => {
  const timeline = (recent: Parameters<typeof CashTimeline>[0]["recent"]) =>
    renderToStaticMarkup(<CashTimeline recent={recent} />);
  expect(timeline({})).toContain("Consultando movimientos…");
  expect(timeline({ failed: true })).toContain(
    "No se pudieron consultar los movimientos.",
  );
  expect(timeline({ activity: { movements: [] } })).toContain(
    "Sin movimientos en los últimos 7 días.",
  );
});

it("la barra muestra el estado y no inventa datos sin sesión", () => {
  const closed = bar({ registerName: "Central" });
  expect(closed).toContain("Central");
  expect(closed).toContain("Cerrada");
  expect(closed).toContain("Abrí una sesión");
  expect(closed).not.toContain("NaN");
  const opened = bar({ session, responsibleName: "Ana" });
  expect(opened).toContain("Abierta");
  expect(opened).toContain("Carlos");
  expect(opened).toContain("Responsable: Ana");
});

it("reemplaza el nombre por el selector cuando hay varias cajas", () => {
  const html = bar({
    registerName: "Central",
    registerPicker: <select aria-label="Caja" />,
  });
  expect(html).toContain('aria-label="Caja"');
  expect(html).not.toContain("Central");
});

it("deja a la vista los cobros pendientes y su total", () => {
  const html = bar({ pending: { count: 3, totalMinor: 1240000n } });
  expect(html).toContain("3 cobros pendientes");
  expect(html).toContain("12.400,00");
  expect(html).toContain("has-pending");
  expect(bar({ pending: { count: 1, totalMinor: 100n } })).toContain(
    "1 cobro pendiente",
  );
  expect(bar({ pending: { count: 0, totalMinor: 0n } })).toContain(
    "Sin cobros pendientes",
  );
});

it("mantiene el acceso a pendientes si falló la consulta", () => {
  const html = bar();
  expect(html).toContain("Cobros pendientes");
  expect(html).not.toContain("has-pending");
});
