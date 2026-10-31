import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SupplierTermsFields } from "./supplier-terms";

it("shows a neutral payment selector and a compact prefilled term", () => {
  const html = renderToStaticMarkup(
    <SupplierTermsFields
      value={{ accountEnabled: true, accountTermDays: 15 }}
      onChange={() => undefined}
    />,
  );
  expect(html).toContain("Condición de pago");
  expect(html).toContain("Plazo de pago");
  expect(html).toContain('value="15"');
  expect(html).not.toContain('type="checkbox"');
  expect(html).toContain('role="combobox"');
  expect(html).not.toContain("<select");
});
it("hides the term without an account and preserves undefined and same-day terms", () => {
  const render = (accountEnabled: boolean, accountTermDays: number | null) =>
    renderToStaticMarkup(
      <SupplierTermsFields
        value={{ accountEnabled, accountTermDays }}
        onChange={() => undefined}
      />,
    );
  expect(render(false, null)).not.toContain('type="number"');
  expect(render(true, null)).toContain('value=""');
  expect(render(true, 0)).toContain('value="0"');
});
