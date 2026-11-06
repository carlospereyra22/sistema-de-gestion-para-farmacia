import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountCustomerHome } from "./account-customer-home";
import type { CustomerAccount } from "./lib/api";

const account: CustomerAccount = {
  id: "ana",
  name: "Ana Gómez",
  active: true,
  creditEnabled: true,
  creditLimitMinor: null,
  balanceMinor: "820000",
  movements: [],
};
const props = {
  disabled: false,
  loading: false,
  onSelect: () => {},
  onCreate: () => {},
};

it("muestra indicadores generales y clientes sin abrir ninguna cuenta", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerHome
      {...props}
      accounts={[
        account,
        { ...account, id: "juan", name: "Juan", balanceMinor: "-500" },
      ]}
    />,
  );
  expect(html).toContain("Total por cobrar");
  expect(html).toContain("8.200,00");
  expect(html).toContain("Clientes con deuda");
  expect(html).toContain("Ana Gómez");
  expect(html).toContain("Juan");
  expect(html).toContain("Nuevo cliente");
  expect(html).not.toContain("Cuenta del cliente");
  expect(html).not.toContain("Resumen del cobro");
});
it("invita a crear el primer cliente cuando la organización no tiene ninguno", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerHome {...props} accounts={[]} />,
  );
  expect(html).toContain("Todavía no hay clientes.");
  expect(html).toContain("Crear el primer cliente");
});
