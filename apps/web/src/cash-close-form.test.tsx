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

it("ofrece el efectivo esperado sin completarlo solo", () => {
  const html = renderToStaticMarkup(
    <CashCloseForm
      session={session}
      token="test"
      organizationId="org"
      branchId="branch"
      onClosed={() => {}}
    />,
  );
  // El conteo arranca vacío: el esperado sólo se usa si el cajero lo toca.
  expect(html).toContain('value=""');
  // La moneda lleva un espacio duro entre "$" y el número.
  expect(html).toMatch(/Efectivo esperado <strong>\$\s16\.000,00<\/strong>/);
  expect(html).toMatch(
    /aria-label="Contaste lo mismo que el efectivo esperado: \$\s16\.000,00"/,
  );
  expect(html).toContain(">Coincide</button>");
});

it("el importe que completa Coincide se lee igual que el esperado", async () => {
  const { formatAmountTyping } = await import("./lib/amount-typing");
  const { lotCostInput } = await import("./lib/lot-cost");
  const { typedCashMinor } = await import("./lib/cash-count");
  for (const minor of ["11503960", "0", "5", "123456789"])
    expect(typedCashMinor(formatAmountTyping(lotCostInput(minor)))).toBe(
      Number(minor),
    );
});

it("con ventas sin enviar no ofrece usar el esperado", () => {
  const html = renderToStaticMarkup(
    <CashCloseForm
      session={session}
      token="test"
      organizationId="org"
      branchId="branch"
      ventasSinEnviar={1}
      onClosed={() => {}}
    />,
  );
  expect(html).not.toContain(">Coincide</button>");
});
