import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  PlatformBilling,
  PlatformCharge,
  PlatformPayment,
  PlatformSubscription,
} from "./lib/platform-api";
import { PlatformBillingSection } from "./platform-billing";

const subscription: PlatformSubscription = {
  stage: "GRACE",
  access: "FULL",
  daysOverdue: 3,
  exempt: false,
  trialEndsAt: "2026-11-04",
  paidThrough: null,
  extendedUntil: null,
  extendedReason: null,
  extraUsers: 0,
  extraBranches: 0,
  agreedPriceMinor: null,
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  feeMinor: "5500000",
  quota: { users: 1, branches: 1 },
};

const charge = (index: number, extra: Partial<PlatformCharge> = {}) => ({
  id: `cargo-${index}`,
  periodStart: `2026-${String(index).padStart(2, "0")}-05`,
  periodEnd: `2026-${String(index + 1).padStart(2, "0")}-04`,
  amountMinor: "5500000",
  paidMinor: "0",
  balanceMinor: "5500000",
  waived: false,
  waiveReason: null,
  ...extra,
});

const payment = (extra: Partial<PlatformPayment> = {}): PlatformPayment => ({
  id: "pago-1",
  amountMinor: "2000000",
  paidOn: "2026-11-06",
  method: "TRANSFER",
  reference: "Op 123",
  voided: false,
  voidReason: null,
  ...extra,
});

const billing: PlatformBilling = {
  today: "2026-11-07",
  balanceMinor: "3500000",
  creditMinor: "0",
  charges: [charge(11, { paidMinor: "2000000", balanceMinor: "3500000" })],
  payments: [payment()],
};

const render = (
  overrides: Partial<PlatformBilling> = {},
  subscriptionOverrides: Partial<PlatformSubscription> = {},
) =>
  renderToStaticMarkup(
    <PlatformBillingSection
      token="token"
      organization={{
        id: "farmacia",
        name: "Farmacia Sur",
        billing: { ...billing, ...overrides },
        subscription: { ...subscription, ...subscriptionOverrides },
      }}
      onChanged={() => {}}
    />,
  );

describe("PlatformBillingSection", () => {
  it("muestra cuánto debe y cada cargo con su estado", () => {
    const html = render();

    expect(html).toContain("Debe $ 35.000,00");
    expect(html).toContain("05/11/2026");
    expect(html).toContain("al 04/12/2026");
    expect(html).toContain("Pago parcial");
  });

  it("muestra cada pago con su medio y referencia", () => {
    const html = render();

    expect(html).toContain("06/11/2026");
    expect(html).toContain("Transferencia");
    expect(html).toContain("Op 123");
    expect(html).toContain("$ 20.000,00");
  });

  it("un pago anulado queda a la vista con su motivo y sin acción", () => {
    const html = render({
      payments: [payment({ voided: true, voidReason: "Se cargó dos veces" })],
    });

    expect(html).toContain("Anulado");
    expect(html).toContain("Se cargó dos veces");
    expect(html).not.toContain("Anular el pago");
  });

  it("solo se condona lo que tiene saldo", () => {
    const html = render({
      charges: [
        charge(10, { balanceMinor: "0", paidMinor: "5500000" }),
        charge(11),
      ],
    });

    expect(html).not.toContain("Condonar el cargo del 05/10/2026");
    expect(html).toContain("Condonar el cargo del 05/11/2026");
  });

  it("un cargo condonado muestra por qué", () => {
    const html = render({
      charges: [
        charge(11, {
          waived: true,
          balanceMinor: "0",
          waiveReason: "Sin servicio: la farmacia estaba bloqueada.",
        }),
      ],
    });

    expect(html).toContain("Condonado");
    expect(html).toContain("Sin servicio");
  });

  it("avisa cuando todavía no hay movimientos", () => {
    const html = render({
      balanceMinor: "0",
      charges: [],
      payments: [],
    });

    expect(html).toContain("Sin deuda");
    expect(html).toContain("Todavía no tiene cargos.");
    expect(html).toContain("Todavía no registró pagos.");
  });

  it("muestra la prórroga vigente con su motivo y permite quitarla", () => {
    const html = render(
      {},
      {
        stage: "EXTENDED",
        extendedUntil: "2026-12-01",
        extendedReason: "Paga en cuotas",
      },
    );

    expect(html).toContain("Con prórroga hasta 01/12/2026");
    expect(html).toContain("Paga en cuotas");
    expect(html).toContain("Quitar prórroga");
    expect(html).toContain("Cambiar prórroga");
  });

  it("una prórroga vencida no se muestra como vigente", () => {
    const html = render({}, { extendedUntil: "2026-10-01" });

    expect(html).not.toContain("Con prórroga hasta");
    expect(html).toContain("Dar prórroga");
  });

  it("pagina los cargos de a cinco", () => {
    const html = render({
      charges: [1, 2, 3, 4, 5, 6].map((month) => charge(month)),
    });

    expect(html).toContain("6 cargos");
    expect(html).toContain("5 por página");
    expect(html).not.toContain("05/06/2026");
  });
});
