import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountCustomerPicker } from "./account-customer-picker";
it("shows the selected customer in a compact accessible search control", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerPicker
      accounts={[
        {
          id: "one",
          name: "Carlos",
          active: true,
          creditEnabled: true,
          creditLimitMinor: null,
          balanceMinor: "1000",
          movements: [],
        },
      ]}
      selectedId="one"
      disabled={false}
      loading={false}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain('role="combobox"');
  expect(html).toContain('value="Carlos"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("Lista de clientes con cuenta corriente");
});
it("prevents changing customers while an operation is busy", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerPicker
      accounts={[]}
      selectedId=""
      disabled
      loading={false}
      onSelect={() => {}}
    />,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
