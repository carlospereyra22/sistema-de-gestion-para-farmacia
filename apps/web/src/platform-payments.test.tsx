import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  PlatformOrganization,
  PlatformRecentPayment,
  PlatformSubscription,
} from "./lib/platform-api";
import {
  PlatformDebtorsTable,
  PlatformRecentPaymentsTable,
} from "./platform-payments";

const subscription: PlatformSubscription = {
  stage: "READ_ONLY",
  access: "READ_ONLY",
  nextCut: null,
  daysOverdue: 15,
  exempt: false,
  trialEndsAt: "2026-10-23",
  paidThrough: null,
  extendedUntil: null,
  extendedReason: null,
  extraUsers: 0,
  extraBranches: 0,
  agreedPriceMinor: null,
  contactName: "Laura",
  contactPhone: "351 555 0000",
  contactEmail: null,
  feeMinor: "5500000",
  quota: { users: 1, branches: 1 },
};

const organization = (
  index: number,
  overrides: Partial<PlatformSubscription> = {},
): PlatformOrganization => ({
  id: String(index),
  name: `Farmacia ${index}`,
  createdAt: "2026-10-01T00:00:00.000Z",
  activeUsers: 1,
  activeBranches: 1,
  balanceMinor: "5500000",
  subscription: { ...subscription, ...overrides },
});

const payment = (
  extra: Partial<PlatformRecentPayment> = {},
): PlatformRecentPayment => ({
  id: "pago",
  organizationId: "1",
  organizationName: "Farmacia 1",
  amountMinor: "5500000",
  paidOn: "2026-11-06",
  method: "CASH",
  reference: null,
  voided: false,
  voidReason: null,
  ...extra,
});

const debtorsHtml = (rows: PlatformOrganization[]) =>
  renderToStaticMarkup(<PlatformDebtorsTable rows={rows} onOpen={() => {}} />);

const paymentsHtml = (rows: PlatformRecentPayment[]) =>
  renderToStaticMarkup(
    <PlatformRecentPaymentsTable rows={rows} onOpen={() => {}} />,
  );

describe("PlatformDebtorsTable", () => {
  it("muestra a quién llamar y cuánto debe", () => {
    const html = debtorsHtml([organization(1)]);

    expect(html).toContain("Farmacia 1");
    expect(html).toContain("Solo lectura");
    expect(html).toContain("23/10/2026");
    expect(html).toContain("351 555 0000");
    expect(html).toContain("Próximo corte");
    expect(html).toContain("$ 55.000,00");
  });

  it("sin teléfono cae al correo, y si no hay nada lo dice", () => {
    expect(
      debtorsHtml([
        organization(1, {
          contactPhone: null,
          contactEmail: "dueña@example.invalid",
        }),
      ]),
    ).toContain("dueña@example.invalid");
    expect(
      debtorsHtml([
        organization(1, {
          contactPhone: null,
          contactEmail: null,
          contactName: null,
        }),
      ]),
    ).toContain("Sin contacto");
  });

  it("sin deudas lo dice", () => {
    expect(debtorsHtml([])).toContain("Ninguna farmacia debe.");
  });

  it("pagina de a diez", () => {
    const html = debtorsHtml(
      Array.from({ length: 11 }, (_, index) => organization(index + 1)),
    );

    expect(html).toContain("11 farmacias");
    expect(html).not.toContain("Farmacia 11");
  });
});

describe("PlatformRecentPaymentsTable", () => {
  it("muestra fecha, farmacia, medio e importe", () => {
    const html = paymentsHtml([payment({ reference: "Recibo 9" })]);

    expect(html).toContain("06/11/2026");
    expect(html).toContain("Farmacia 1");
    expect(html).toContain("Efectivo");
    expect(html).toContain("Recibo 9");
    expect(html).toContain("$ 55.000,00");
  });

  it("distingue un pago anulado", () => {
    expect(paymentsHtml([payment({ voided: true })])).toContain("Anulado");
  });

  it("sin pagos lo dice", () => {
    expect(paymentsHtml([])).toContain("Todavía no se registraron pagos.");
  });
});
