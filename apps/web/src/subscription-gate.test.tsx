import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Sale } from "./lib/api";
import { SubscriptionNoticeContext } from "./lib/subscription-notice-context";
import type { SubscriptionStatus } from "./lib/subscription-status";
import { SubscriptionInvoicesTable } from "./subscription-documents";
import {
  SubscriptionBlockedScreen,
  SubscriptionGate,
  SubscriptionNoticeChip,
} from "./subscription-gate";

const blocked: SubscriptionStatus = {
  stage: "BLOCKED",
  access: "BLOCKED",
  daysOverdue: 40,
  coveredUntil: "2026-09-28",
  daysLeft: null,
  nextCut: null,
  isOwner: true,
  balanceMinor: "5500000",
};

const screen = (status: SubscriptionStatus) =>
  renderToStaticMarkup(
    <SubscriptionBlockedScreen
      status={status}
      token="token"
      organizationId="org"
      email="duena@example.invalid"
      onVerify={vi.fn()}
      onLogout={vi.fn()}
    />,
  );

describe("pantalla de bloqueo", () => {
  it("al dueño le muestra el saldo, cómo verificar y sus facturas", () => {
    const html = screen(blocked);

    expect(html).toContain("Farmacia bloqueada por falta de pago");
    expect(html).toContain("$ 55.000,00");
    expect(html).toContain("Ya pagué, verificar");
    expect(html).toContain("Ver facturas");
    expect(html).toContain("Cerrar sesión");
  });

  it("al empleado no le muestra saldo ni facturas", () => {
    const html = screen({ ...blocked, isOwner: false, balanceMinor: null });

    expect(html).toContain("Avisale al dueño");
    expect(html).not.toContain("Saldo pendiente");
    expect(html).not.toContain("Ver facturas");
    expect(html).toContain("Ya pagué, verificar");
  });
});

describe("aviso en el encabezado", () => {
  const chip = (status: SubscriptionStatus | null) =>
    renderToStaticMarkup(
      <SubscriptionNoticeContext.Provider
        value={status ? { status, storageKey: "x" } : null}
      >
        <SubscriptionNoticeChip />
      </SubscriptionNoticeContext.Provider>,
    );

  it("en solo lectura muestra el motivo corto y el detalle al pasar", () => {
    const html = chip({ ...blocked, stage: "READ_ONLY", access: "READ_ONLY" });

    expect(html).toContain("Solo lectura por falta de pago");
    expect(html).toContain("podés consultar y terminar lo pendiente");
  });

  it("antes de vencer muestra la fecha", () => {
    expect(
      chip({
        ...blocked,
        stage: "ACTIVE",
        access: "FULL",
        daysLeft: 2,
        coveredUntil: "2026-11-09",
      }),
    ).toContain("Abono vence el 09/11");
  });

  it("sin estado, o fuera de la farmacia, no muestra nada", () => {
    expect(chip(null)).toBe("");
  });
});

describe("SubscriptionGate", () => {
  it("sin sesión completa no se interpone", () => {
    const html = renderToStaticMarkup(
      <SubscriptionGate email="x" onLogout={vi.fn()}>
        <p>Sistema</p>
      </SubscriptionGate>,
    );

    expect(html).toBe("<p>Sistema</p>");
  });

  it("el aviso no se agrega arriba del sistema: va en su encabezado", () => {
    const html = renderToStaticMarkup(
      <SubscriptionGate email="x" onLogout={vi.fn()}>
        <SubscriptionNoticeChip />
        <p>Sistema</p>
      </SubscriptionGate>,
    );

    expect(html).toBe("<p>Sistema</p>");
  });

  it("mientras consulta, espera en lugar de mostrar el sistema", () => {
    const html = renderToStaticMarkup(
      <SubscriptionGate
        token="token"
        organizationId="org"
        email="x"
        onLogout={vi.fn()}
      >
        <p>Sistema</p>
      </SubscriptionGate>,
    );

    expect(html).not.toContain("Sistema</p>");
    expect(html).toContain("recuperando tu sesión");
  });
});

describe("facturas con la farmacia bloqueada", () => {
  const sale = (index: number): Sale => ({
    id: `venta-${index}`,
    documentType: "INVOICE",
    status: "COMPLETED",
    totalMinor: "123450",
    completedAt: "2026-11-05T15:00:00.000Z",
    items: [],
    payments: [],
  });

  it("lista cada factura con su total", () => {
    const html = renderToStaticMarkup(
      <SubscriptionInvoicesTable sales={[sale(1)]} onOpen={vi.fn()} />,
    );

    expect(html).toContain("05/11/2026");
    expect(html).toContain("$ 1.234,50");
    expect(html).toContain("Ver factura");
  });

  it("sin facturas lo dice", () => {
    expect(
      renderToStaticMarkup(
        <SubscriptionInvoicesTable sales={[]} onOpen={vi.fn()} />,
      ),
    ).toContain("Esta sucursal no tiene facturas.");
  });
});
