import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountPaymentMethods } from "./account-payment-methods";

it("keeps icon-only methods named and the selected method accessible", () => {
  const html = renderToStaticMarkup(
    <AccountPaymentMethods value="CASH" onChange={() => {}} />,
  );
  for (const label of ["Efectivo", "Transferencia", "Tarjeta"])
    expect(html).toContain(`aria-label="${label}"`);
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html.match(/width="24"/g)).toHaveLength(3);
  expect(html.match(/hidden=""/g)).toHaveLength(3);
  expect(html.match(/type="button"/g)).toHaveLength(3);
  expect(html).toContain("bottom-full");
});
