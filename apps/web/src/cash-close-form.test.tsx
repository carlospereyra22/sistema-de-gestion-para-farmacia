import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CashCloseForm } from "./cash-close-form";
import type { CashSession } from "./lib/api";

const session: CashSession = {
  id: "s",
  cashRegisterId: "r",
  openedAt: "2026-10-17T12:00:00Z",
  closedAt: null,
  openingAmountMinor: "1000000",
  closingAmountMinor: null,
  cashSalesMinor: "500000",
  saleChangeMinor: "0",
  cardMinor: "0",
  transferMinor: "0",
  manualInMinor: "200000",
  manualOutMinor: "100000",
  expectedAmountMinor: "1600000",
  differenceMinor: null,
  movements: [],
};

it("starts with an empty count and a disabled single-line reason, without submitting", () => {
  const html = renderToStaticMarkup(
    <CashCloseForm
      session={session}
      token="test"
      organizationId="org"
      branchId="branch"
      onClosed={() => {}}
    />,
  );
  expect(html).not.toContain("<dialog");
  expect(html).toContain('<form aria-label="Cerrar caja"');
  expect(html).toContain('value=""');
  expect(html).toContain('placeholder="0,00"');
  expect(html).not.toContain("<textarea");
  expect(html).toContain("grid-cols-2");
  expect(html).toMatch(/<input[^>]*disabled[^>]*placeholder="No corresponde"/);
  expect(html).toContain("Confirmar cierre");
  expect(html).toContain("disabled");
  expect(html).not.toContain("sin conexión");
});

it("no deja cerrar mientras haya ventas sin conexión por enviar", () => {
  const html = renderToStaticMarkup(
    <CashCloseForm
      session={session}
      token="test"
      organizationId="org"
      branchId="branch"
      ventasSinEnviar={2}
      onClosed={() => {}}
    />,
  );
  expect(html).toContain(
    "Hay 2 ventas cobradas sin conexión que todavía no se enviaron.",
  );
  expect(html).toMatch(/<input[^>]*disabled[^>]*placeholder="0,00"/);
});
