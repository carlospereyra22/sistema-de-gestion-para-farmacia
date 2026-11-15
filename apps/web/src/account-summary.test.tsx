import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountSummary } from "./account-summary";

it("distributes the three existing metrics without changing their values", () => {
  const html = renderToStaticMarkup(
    <AccountSummary debtMinor={5658000} enabled={4} owing={2} />,
  );
  expect(html).toContain("56.580,00");
  expect(html).toContain("Cuentas habilitadas");
  expect(html).toContain("Clientes con deuda");
  expect(html.match(/<dt /g)).toHaveLength(3);
  expect(html).toContain("md:grid-cols-3");
  expect(html).toContain("px-3 py-2 shadow-sm");
  expect(html).not.toContain("text-2xl");
  expect(html).toContain(">4</dd>");
  expect(html).toContain(">2</dd>");
  expect(html.match(/border-top-width:4px/g)).toHaveLength(3);
  expect(html).toContain("var(--color-azul-487)");
  expect(html).toContain("var(--color-verde-561)");
  expect(html).toContain("var(--color-violeta-541)");
});
