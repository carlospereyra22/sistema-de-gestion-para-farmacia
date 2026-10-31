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
it("paginates the customer sidebar in groups of five with compact controls", () => {
  const accounts = Array.from({ length: 7 }, (_, index) => ({
    ...account,
    id: `customer-${index}`,
    name: `Cliente ${index + 1}`,
  }));
  const html = renderToStaticMarkup(
    <AccountCustomerList
      accounts={accounts}
      selectedId={accounts[0].id}
      disabled={false}
      loading={false}
      query=""
      onQuery={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("Cliente 5");
  expect(html).not.toContain("Cliente 6");
  expect(html).toContain("1–5 de 7");
  expect(html).toContain('aria-label="Página 2 de clientes"');
  expect(html).toContain('aria-current="page"');
  expect(html).toContain("lg:[contain:size]");
});
it("filters before pagination and keeps empty results accessible", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerList
      accounts={[account]}
      selectedId={account.id}
      disabled={false}
      loading={false}
      query="inexistente"
      onQuery={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("No hay clientes para esta búsqueda.");
  expect(html).toContain("0 clientes");
  expect(html).not.toContain('aria-label="Página 2 de clientes"');
});
it("keeps dropdown filters compact without a repeated title or counters", () => {
  const html = renderToStaticMarkup(
    <AccountCustomerList
      dropdown
      accounts={[account]}
      selectedId={account.id}
      disabled={false}
      loading={false}
      query=""
      onQuery={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(html).not.toContain("<h2");
  expect(html).not.toContain("opacity-75");
  expect(html).toContain('aria-label="Filtrar clientes por saldo"');
  expect(html).toContain("grid-cols-3");
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("Con deuda");
  expect(html).toContain("Al día");
  expect(html).toContain("Páginas de clientes");
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
  expect(html).not.toContain("title=");
  expect(html.match(/role="tooltip" hidden=""/g)).toHaveLength(4);
  expect(html.match(/bottom-full z-50 pb-2/g)).toHaveLength(4);
  expect(html).not.toContain("top-full");
  expect(html.match(/tabindex="0"/g)).toHaveLength(4);
  const hintIds = [...html.matchAll(/aria-describedby="([^"]+)"/g)];
  expect(hintIds).toHaveLength(4);
  for (const [, id] of hintIds) expect(html).toContain(`id="${id}"`);
  expect(html).not.toContain("mt-[3px]");
});
it("supports accent-insensitive customer search and meaningful empty state", () => {
  const props = {
    accounts: [account],
    selectedId: "one",
    disabled: false,
    loading: false,
    onQuery: () => {},
    onSelect: () => {},
  };
  expect(
    renderToStaticMarkup(<AccountCustomerList {...props} query="gomez" />),
  ).toContain("April Gómez");
  expect(
    renderToStaticMarkup(<AccountCustomerList {...props} query="missing" />),
  ).toContain("No hay clientes");
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
