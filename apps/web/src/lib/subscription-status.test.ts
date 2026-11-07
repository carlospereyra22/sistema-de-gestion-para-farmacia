import { describe, expect, it } from "vitest";
import {
  blockedCopy,
  subscriptionNotice,
  type SubscriptionStatus,
} from "./subscription-status";

const status = (
  extra: Partial<SubscriptionStatus> = {},
): SubscriptionStatus => ({
  stage: "ACTIVE",
  access: "FULL",
  daysOverdue: 0,
  coveredUntil: "2026-11-20",
  daysLeft: 13,
  nextCut: null,
  isOwner: true,
  balanceMinor: "0",
  ...extra,
});

describe("aviso del abono", () => {
  it("lejos del vencimiento no avisa", () => {
    expect(subscriptionNotice(status())).toBeNull();
  });

  it("avisa al dueño desde 5 días antes", () => {
    expect(subscriptionNotice(status({ daysLeft: 6 }))).toBeNull();
    expect(subscriptionNotice(status({ daysLeft: 5 }))).toEqual({
      tone: "info",
      dismissible: true,
      label: "Abono vence el 20/11",
      text: "El abono vence el 20/11/2026.",
    });
  });

  it("el día del vencimiento dice hoy", () => {
    expect(subscriptionNotice(status({ daysLeft: 0 }))).toMatchObject({
      label: "Abono vence hoy",
      text: "El abono vence hoy.",
    });
  });

  it("distingue la prueba y la prórroga", () => {
    expect(
      subscriptionNotice(status({ stage: "TRIAL", daysLeft: 2 })),
    ).toMatchObject({
      label: "Prueba termina el 20/11",
      text: "La prueba termina el 20/11/2026.",
    });
    expect(
      subscriptionNotice(status({ stage: "EXTENDED", daysLeft: 2 }))?.text,
    ).toBe("La prórroga termina el 20/11/2026.");
  });

  it("vencido, avisa cuándo pasa a solo lectura", () => {
    expect(
      subscriptionNotice(
        status({
          stage: "GRACE",
          daysLeft: null,
          nextCut: { access: "READ_ONLY", on: "2026-11-12", inDays: 5 },
        }),
      ),
    ).toEqual({
      tone: "warning",
      dismissible: true,
      label: "Abono vencido",
      text: "El abono está vencido. Si no se registra el pago, el 12/11/2026 la farmacia pasa a solo lectura.",
    });
  });

  it("al mostrador no le avisa antes de que algo cambie", () => {
    expect(
      subscriptionNotice(status({ isOwner: false, daysLeft: 1 })),
    ).toBeNull();
    expect(
      subscriptionNotice(status({ isOwner: false, stage: "GRACE" })),
    ).toBeNull();
  });

  it("en solo lectura avisa a todos y no se puede cerrar", () => {
    const owner = subscriptionNotice(
      status({
        stage: "READ_ONLY",
        access: "READ_ONLY",
        nextCut: { access: "BLOCKED", on: "2026-12-01", inDays: 10 },
      }),
    );
    const counter = subscriptionNotice(
      status({ stage: "READ_ONLY", access: "READ_ONLY", isOwner: false }),
    );

    expect(owner).toMatchObject({
      tone: "danger",
      dismissible: false,
      label: "Solo lectura por falta de pago",
    });
    expect(owner?.text).toContain("se bloquea el 01/12/2026");
    expect(counter?.text).toContain("Avisale al dueño");
  });

  it("una exenta nunca ve avisos", () => {
    expect(
      subscriptionNotice(
        status({ stage: "EXEMPT", coveredUntil: null, daysLeft: null }),
      ),
    ).toBeNull();
  });
});

describe("pantalla de bloqueo", () => {
  const blocked = (extra: Partial<SubscriptionStatus> = {}) =>
    status({ stage: "BLOCKED", access: "BLOCKED", ...extra });

  it("explica al dueño cómo volver y que no perdió nada", () => {
    const copy = blockedCopy(blocked());

    expect(copy.title).toBe("Farmacia bloqueada por falta de pago");
    expect(copy.body).toContain("regularizar el abono");
    expect(copy.body).toContain("Tus datos están guardados");
  });

  it("al empleado lo manda al dueño", () => {
    expect(blockedCopy(blocked({ isOwner: false })).body).toContain(
      "Avisale al dueño",
    );
  });

  it("distingue suspendida y dada de baja", () => {
    expect(blockedCopy(blocked({ stage: "SUSPENDED" })).title).toBe(
      "Farmacia suspendida",
    );
    expect(blockedCopy(blocked({ stage: "CANCELLED" })).title).toBe(
      "Farmacia dada de baja",
    );
  });
});
