import { expect, it } from "vitest";
import {
  accountStatementHtml,
  accountStatementPeriod,
  type AccountStatementCustomer,
} from "./account-statement";
const customer: AccountStatementCustomer = {
  id: "a",
  name: "<script>client</script>",
  document: null,
  billingTaxId: null,
  billingPhone: null,
  movements: [
    {
      id: "1",
      type: "DEBIT",
      amountMinor: "10000",
      balanceMinor: "10000",
      createdAt: "2026-10-10T02:00:00Z",
      note: null,
      saleId: "sale",
    },
    {
      id: "2",
      type: "CREDIT",
      amountMinor: "4000",
      balanceMinor: "6000",
      createdAt: "2026-10-10T12:00:00Z",
      note: "<img onerror=alert(1)>",
      saleId: null,
    },
    {
      id: "3",
      type: "CREDIT",
      amountMinor: "6000",
      balanceMinor: "0",
      createdAt: "2026-10-12T12:00:00Z",
      note: null,
      saleId: null,
    },
  ],
};
it("hides internal adjustment rows without changing opening or closing balances", () => {
  const adjusted: AccountStatementCustomer = {
    ...customer,
    movements: [
      ...customer.movements,
      {
        ...customer.movements[0]!,
        id: "adjustment",
        createdAt: "2026-10-13T12:00:00Z",
        amountMinor: "55000",
        balanceMinor: "55000",
        note: "Internal price adjustment",
        showInStatement: false,
      },
    ],
  };
  const period = accountStatementPeriod(adjusted, {
    customerId: "",
    from: "",
    to: "",
  });
  expect(period.movements).toHaveLength(3);
  expect(period.closing).toBe("55000");
  const onlyAdjustments = accountStatementPeriod(adjusted, {
    customerId: "",
    from: "2026-10-13",
    to: "2026-10-13",
  });
  expect(onlyAdjustments.movements).toHaveLength(0);
  expect(onlyAdjustments.closing).toBe("55000");
});
it("keeps the opening balance and uses inclusive Argentina dates", () => {
  const period = accountStatementPeriod(customer, {
    customerId: "a",
    from: "2026-10-10",
    to: "2026-10-10",
  });
  expect(period.opening).toBe("10000");
  expect(period.closing).toBe("6000");
  expect(period.movements.map((m) => m.id)).toEqual(["2"]);
});
it("preserves balances in empty periods and includes settled accounts", () => {
  expect(
    accountStatementPeriod(customer, {
      customerId: "",
      from: "2026-10-11",
      to: "2026-10-11",
    }).closing,
  ).toBe("6000");
  const all = accountStatementPeriod(customer, {
    customerId: "",
    from: "",
    to: "",
  });
  expect(all.opening).toBe("0");
  expect(all.closing).toBe("0");
  expect(all.movements).toHaveLength(3);
});
it("escapes content, scopes customers and prints A4", () => {
  const input = {
    customers: [customer],
    filter: { customerId: "a", from: "", to: "" },
    organization: "Store",
    branch: "Branch",
    generatedAt: "2026-10-12T12:00:00Z",
  };
  const html = accountStatementHtml(input);
  expect(html).toContain("size:A4 portrait");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;img");
  expect(html).toContain("Saldo final");
  expect(html).toContain(
    "<h2>Cliente: &lt;script&gt;client&lt;/script&gt;</h2>",
  );
  expect(
    accountStatementHtml({
      ...input,
      filter: { ...input.filter, customerId: "other" },
    }),
  ).not.toContain("&lt;script&gt;client");
});

it("uses readable payment labels and suppresses only the redundant technical sale note", () => {
  const html = accountStatementHtml({
    customers: [
      {
        ...customer,
        movements: [
          { ...customer.movements[0]!, note: "Sale sale" },
          {
            ...customer.movements[1]!,
            note: "Referencia comercial conservada",
          },
        ],
      },
    ],
    filter: { customerId: "", from: "", to: "" },
    organization: "Farmacia",
    branch: "Central",
    generatedAt: "2026-10-14T12:00:00Z",
  });
  expect(html).not.toContain("Sale sale");
  expect(html).toContain("Referencia comercial conservada");
  expect(html).toContain("Compras / cargos");
  expect(html).toContain("Pagos / créditos");
  expect(html).toContain("Pendiente de pago");
  expect(html).toContain("#1e293b");
  expect(html).toContain("#0088c2");
  expect(html).toContain("table-header-group");
  expect(html).toContain('class="compact-header"');
  expect(html).not.toContain("Cómo leer este resumen");
  expect(html).not.toContain('class="guide"');
});
