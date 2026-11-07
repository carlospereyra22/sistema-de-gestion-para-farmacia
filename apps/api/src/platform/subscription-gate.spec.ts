import { HttpStatus } from "@nestjs/common";

import {
  subscriptionDenied,
  subscriptionRestriction,
  type SubscriptionRule,
} from "./subscription-gate";

describe("subscriptionRestriction", () => {
  const rules: (SubscriptionRule | undefined)[] = [
    undefined,
    "READ_ONLY",
    "OWNER_WHEN_BLOCKED",
    "ALWAYS",
  ];

  it("con acceso completo no restringe nada", () => {
    for (const method of ["GET", "POST", "PATCH", "DELETE"])
      for (const rule of rules)
        expect(subscriptionRestriction("FULL", method, rule)).toBe("NONE");
  });

  describe("en solo lectura", () => {
    it("deja leer", () => {
      expect(subscriptionRestriction("READ_ONLY", "GET", undefined)).toBe(
        "NONE",
      );
      expect(subscriptionRestriction("READ_ONLY", "HEAD", undefined)).toBe(
        "NONE",
      );
    });

    it("frena las escrituras que no están marcadas", () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"])
        expect(subscriptionRestriction("READ_ONLY", method, undefined)).toBe(
          "READ_ONLY",
        );
    });

    it("deja terminar lo pendiente", () => {
      expect(subscriptionRestriction("READ_ONLY", "POST", "READ_ONLY")).toBe(
        "NONE",
      );
    });

    it("lo marcado para el dueño bloqueado no habilita escrituras", () => {
      expect(
        subscriptionRestriction("READ_ONLY", "POST", "OWNER_WHEN_BLOCKED"),
      ).toBe("READ_ONLY");
    });
  });

  describe("bloqueada", () => {
    it("frena también las lecturas y lo pendiente", () => {
      expect(subscriptionRestriction("BLOCKED", "GET", undefined)).toBe(
        "BLOCKED",
      );
      expect(subscriptionRestriction("BLOCKED", "POST", "READ_ONLY")).toBe(
        "BLOCKED",
      );
    });

    it("el dueño sigue leyendo sus comprobantes", () => {
      expect(
        subscriptionRestriction("BLOCKED", "GET", "OWNER_WHEN_BLOCKED"),
      ).toBe("OWNER_ONLY");
    });

    it("pero no puede escribir en esas rutas", () => {
      expect(
        subscriptionRestriction("BLOCKED", "POST", "OWNER_WHEN_BLOCKED"),
      ).toBe("BLOCKED");
    });

    it("la consulta del estado nunca se corta", () => {
      expect(subscriptionRestriction("BLOCKED", "GET", "ALWAYS")).toBe("NONE");
    });
  });
});

describe("subscriptionDenied", () => {
  const body = (error: ReturnType<typeof subscriptionDenied>) =>
    error.getResponse() as { error: string; message: string };

  it("responde 402 con un código que la web reconoce", () => {
    const error = subscriptionDenied("READ_ONLY", "READ_ONLY");

    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(body(error).error).toBe("SUBSCRIPTION_READ_ONLY");
  });

  it("explica por qué está bloqueada", () => {
    expect(body(subscriptionDenied("BLOCKED", "BLOCKED")).message).toContain(
      "falta de pago",
    );
    expect(body(subscriptionDenied("BLOCKED", "SUSPENDED")).message).toBe(
      "La farmacia está suspendida.",
    );
    expect(body(subscriptionDenied("BLOCKED", "CANCELLED")).error).toBe(
      "SUBSCRIPTION_BLOCKED",
    );
  });
});
