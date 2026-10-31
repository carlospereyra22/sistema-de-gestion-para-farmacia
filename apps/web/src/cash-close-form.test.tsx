import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CashCloseForm } from "./cash-close-form";
import type { CashSession } from "./lib/api";

it("starts with an empty count and a disabled single-line reason, without submitting", () => {
  const session: CashSession = {
    id: "s",
    cashRegisterId: "r",
    openedAt: "2026-10-17T12:00:00Z",
    closedAt: null,
    openingAmountMinor: "1000000",
    closingAmountMinor: null,
    cashSalesMinor: "500000",
    manualInMinor: "200000",
    manualOutMinor: "100000",
    expectedAmountMinor: "1600000",
    differenceMinor: null,
    movements: [],
  };
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
  expect(html).not.toContain("<textarea");
  expect(html).toContain("grid-cols-2");
  expect(html).toMatch(/<input[^>]*disabled[^>]*placeholder="No corresponde"/);
  expect(html).toContain("Confirmar cierre");
  expect(html).toContain("disabled");
});
