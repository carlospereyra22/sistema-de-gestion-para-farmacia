import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountDebtIncrease } from "./account-debt-increase";

it("separates an explicit debt adjustment from collecting money", () => {
  const html = renderToStaticMarkup(
    <AccountDebtIncrease
      name="Pastilla"
      pendingMinor="100000"
      disabled={false}
      onSave={async () => {}}
      onCancel={() => {}}
    />,
  );
  expect(html).toContain('value="1000,00"');
  expect(html).toContain("Nuevo saldo pendiente ($)");
  expect(html).not.toContain("Motivo");
  expect(html).toContain("Guardar");
  expect(html).toContain("<dialog");
  expect(html).toContain("Pastilla");
  expect(html.match(/<input/g)).toHaveLength(1);
  expect(html).not.toContain("<form");
  expect(html).not.toContain('type="submit"');
});
it("offers a total and percentage preview before explicit confirmation", () => {
  const html = renderToStaticMarkup(
    <AccountDebtIncrease
      total
      name="Aumentar saldo total"
      pendingMinor="1929000"
      disabled={false}
      onSave={async () => {}}
      onCancel={() => {}}
    />,
  );
  expect(html).toContain("Porcentaje");
  expect(html).toContain("Nuevo total");
  expect(html).toContain("Confirmar aumento");
  expect(html).toContain("proporcionalmente");
  expect(html).not.toContain('type="submit"');
});
