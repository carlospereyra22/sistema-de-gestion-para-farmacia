import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AccountAmountConfirmation } from "./account-amount-confirmation";
it("explains both amounts and defers persistence until collection", () => {
  const html = renderToStaticMarkup(
    <AccountAmountConfirmation
      name="Actron"
      before={900000}
      after={200000}
      disabled={false}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(html).toContain("9.000,00");
  expect(html).toContain("2.000,00");
  expect(html).toContain("Confirmar importe");
  expect(html).toContain("al confirmar el cobro");
  expect(html).toContain("Volver");
});
