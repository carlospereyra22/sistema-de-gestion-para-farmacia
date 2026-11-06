import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  AccountCustomerList,
  AccountCustomerProfile,
} from "./account-customer-panels";
import { accountInitials } from "./lib/account-initials";
import { AccountDueOverview, AccountDueFollowup } from "./account-due-overview";
import type { CustomerAccount } from "./lib/api";
import type { AccountDueRow } from "./lib/account-due-dates";

const account: CustomerAccount = {
  id: "one",
  name: "April Gómez",
  active: true,
  creditEnabled: true,
  creditLimitMinor: "10000000",
  balanceMinor: "6000000",
  accountTermDays: 30,
  movements: [
    {
      id: "receipt",
      type: "CREDIT",
      amountMinor: "18000000",
      createdAt: "2026-10-09T12:00:00Z",
      note: null,
      saleId: null,
    },
    {
      id: "cancel",
      type: "CREDIT",
      amountMinor: "100000",
      createdAt: "2026-10-10T12:00:00Z",
      note: null,
      saleId: "sale",
    },
  ],
};
const listProps = {
  disabled: false,
  loading: false,
  query: "",
  onQuery: () => {},
  onSelect: () => {},
  onCreate: () => {},
};
it("pagina la lista de clientes de a diez, con columnas y alta", () => {
  const accounts = Array.from({ length: 12 }, (_, index) => ({
    ...account,
    id: `customer-${index}`,
    name: `Cliente ${String.fromCharCode(65 + index)}`,
  }));
  const html = renderToStaticMarkup(
    <AccountCustomerList {...listProps} accounts={accounts} />,
  );
  expect(html).toContain("Cliente J");
  expect(html).not.toContain("Cliente K");
  expect(html).toContain("12 clientes · 10 por página");
  expect(html).toContain('aria-label="Página 2"');
  expect(html).toContain('aria-label="Páginas de clientes"');
  expect(html).toContain("pagination-footer");
  expect(html).toContain('aria-current="page"');
  expect(html).toContain("md:grid-cols-");
  expect(html).toContain("Nuevo cliente");
  expect(html).toContain("<h2");
  expect(html).toContain('aria-label="Filtrar clientes por saldo"');
  expect(html).toContain("Saldo: todos");
  expect(html).toContain("Cuenta corriente: todos");
  expect(html.match(/aria-haspopup="listbox"/g)).toHaveLength(4);
  expect(html).not.toContain("aria-pressed");
});
it("ofrece crear el cliente cuando la búsqueda no encuentra a nadie", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerList
      {...listProps}
      accounts={[account]}
      query=" María Pérez "
    />,
  );
  expect(html).toContain("No encontramos «María Pérez».");
  expect(html).toContain("Crear «María Pérez»");
  expect(html).toContain("0 clientes");
  expect(html).not.toContain('aria-label="Página 2"');
});
it("no propone un CUIT o teléfono como nombre del cliente nuevo", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerList
      {...listProps}
      accounts={[account]}
      query="20-12345678-9"
    />,
  );
  expect(html).toContain("No encontramos «20-12345678-9».");
  expect(html).not.toContain("Crear «");
});
it("no ofrece el alta mientras las cuentas siguen cargando", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerList {...listProps} loading accounts={[]} />,
  );
  expect(html).toContain("Cargando cuentas…");
  expect(html).not.toContain("Crear el primer cliente");
});
it("distingue a los clientes eliminados, que pueden tener deuda por cobrar", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerList
      {...listProps}
      accounts={[{ ...account, active: false }]}
    />,
  );
  expect(html).toContain("Eliminado");
  expect(html).toContain("Con deuda");
});
it("muestra por separado quién creó el cliente y quién habilitó la cuenta", () => {
  const props = {
    ...account,
    createdBy: { id: "ana", name: "Ana Caja" },
    creditEnabledBy: { id: "luz", name: "Luz Admin" },
  };
  const list = renderToStaticMarkup(
    <AccountCustomerList {...listProps} accounts={[props]} />,
  );
  expect(list).toContain("Creado por");
  expect(list).toContain("Ana Caja");
  expect(list).toContain("Por: Luz Admin");
  expect(list).toContain('aria-label="Filtrar clientes por quién los creó"');
  expect(list).toContain("Creado por: todos");
  expect(list).toContain("Habilitada por: todos");
  const profile = renderToStaticMarkup(
    <AccountCustomerProfile account={props} />,
  );
  expect(profile).toContain("Creado por: Ana Caja");
  expect(profile).toContain("Cuenta habilitada por: Luz Admin");
});
it("no inventa usuarios ni muestra quién habilitó una cuenta sin crédito", () => {
  const profile = renderToStaticMarkup(
    <AccountCustomerProfile
      account={{ ...account, creditEnabled: false, creditEnabledBy: null }}
    />,
  );
  expect(profile).toContain("Creado por: Sin datos");
  expect(profile).not.toContain("Cuenta habilitada por");
});
it("muestra el contacto debajo del nombre en la ficha", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerProfile
      account={{ ...account, document: "27-34567890-1" }}
    />,
  );
  expect(html).toContain('aria-label="Datos del cliente"');
  expect(html).toContain("27-34567890-1");
  expect(html.indexOf("April Gómez")).toBeLessThan(
    html.indexOf("27-34567890-1"),
  );
  expect(html.match(/Crédito habilitado/g)).toHaveLength(1);
});
it("shows actual credit and last receipt, excluding cancellation credits", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerProfile account={account} />,
  );
  expect(html).toContain("60.000,00");
  expect(html).toContain("40.000,00");
  expect(html).toContain("180.000,00");
  expect(html).toContain("9/10/2026");
  expect(html).toContain("30 días");
  expect(html).not.toContain("10/10/2026");
});
it("handles no payments and credit balances without inventing dates", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerProfile
      account={{
        ...account,
        balanceMinor: "-1000",
        accountTermDays: null,
        movements: [],
      }}
    />,
  );
  expect(html).toContain("Saldo a favor");
  expect(html).toContain("Sin pagos");
  expect(html).toContain("Sin vencimiento");
  expect(accountInitials("  April Gómez ")).toBe("AG");
});
it("uses subtle white cards with four colored top borders", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerProfile account={account} />,
  );
  expect(html.match(/border-top-width:3px/g)).toHaveLength(4);
  expect(html.match(/bg-white p-3 shadow-sm/g)).toHaveLength(4);
  expect(html).not.toContain("bg-rose-50/70");
  expect(html).not.toContain("bg-sky-50/70");
  expect(html).toContain('class="account-profile"');
  expect(html).toContain('class="account-profile-layout"');
  expect(html).toContain("account-profile-metrics");
});
it("shows the last payment amount before its date inline and moves explanations to hover", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerProfile account={account} />,
  );
  expect(html).toContain("flex flex-wrap items-baseline gap-x-2 text-sm");
  expect(html.indexOf("180.000,00")).toBeLessThan(html.indexOf("9/10/2026"));
  expect(html).toContain("Deuda actual del cliente");
  expect(html).toContain("Límite:");
  expect(html).toContain("Para nuevas ventas");
  expect(html.slice(html.indexOf("account-profile-metrics"))).not.toContain(
    "title=",
  );
  expect(html.match(/role="tooltip" hidden=""/g)).toHaveLength(4);
  expect(html.match(/bottom-full z-50 pb-2/g)).toHaveLength(4);
  expect(html).not.toContain("top-full");
  expect(html.match(/tabindex="0"/g)).toHaveLength(4);
  const hintIds = [...html.matchAll(/aria-describedby="([^"]+)"/g)];
  expect(hintIds).toHaveLength(4);
  for (const [, id] of hintIds) expect(html).toContain(`id="${id}"`);
  expect(html).not.toContain("mt-[3px]");
});
it("supports accent-insensitive customer search", () => {
  expect(
    renderToStaticMarkup(
      <AccountCustomerList {...listProps} accounts={[account]} query="gomez" />,
    ),
  ).toContain("April Gómez");
});
it("counts review rows separately and does not invent overdue amounts", () => {
  const row: AccountDueRow = {
    saleId: "sale",
    customerId: "one",
    customerName: "April",
    saleDate: null,
    dueDate: null,
    pendingMinor: "6000000",
    daysOverdue: 5,
    status: "OVERDUE",
    reviewReason: null,
  };
  const rows: AccountDueRow[] = [
    row,
    { ...row, saleId: "review", status: "REVIEW", pendingMinor: null },
  ];
  const html = renderToStaticMarkup(<AccountDueOverview rows={rows} />);
  expect(html).toContain("60.000,00");
  expect(html).toContain("1 venta pendiente");
  expect(html).not.toContain("120.000");
  expect(html.match(/border-top-width:3px/g)).toHaveLength(4);
  expect(html.match(/bg-white px-4 py-3 shadow-sm/g)).toHaveLength(4);
  expect(html).toContain("Sin vencimiento");
  expect(html).not.toContain("bg-rose-50/70");
  const actions = renderToStaticMarkup(
    <AccountDueFollowup rows={rows} onFilter={() => {}} />,
  );
  expect(actions).toContain("Por conciliar");
  expect(actions).not.toContain("WhatsApp");
});
it("uses an integrated strip for customer due dates while preserving amounts and counts", () => {
  const html = renderToStaticMarkup(
    <AccountDueOverview
      compact
      rows={[
        {
          saleId: "sale",
          customerId: "one",
          customerName: "April",
          saleDate: null,
          dueDate: "2026-10-10",
          pendingMinor: "6000000",
          daysOverdue: 1,
          status: "OVERDUE",
          reviewReason: null,
        },
      ]}
    />,
  );
  expect(html).toContain("60.000,00");
  expect(html).toContain("1 venta pendiente");
  expect(html).toContain("Próximos vencimientos");
  expect(html).toContain("sm:divide-x");
  expect(html).not.toContain("border-top-width");
  expect(html).not.toContain("shadow-sm");
});
