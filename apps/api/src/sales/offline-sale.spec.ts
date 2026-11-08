import {
  OFFLINE_MAX_AGE_MS,
  offlineConceptName,
  offlineOccurredAt,
  offlineRequestHash,
} from "./offline-sale";

describe("venta sin conexión", () => {
  const now = new Date("2026-11-08T15:00:00.000Z");

  it("acepta la fecha real de la venta dentro de los 7 días", () => {
    expect(offlineOccurredAt("2026-11-08T10:00:00.000Z", now)).toEqual(
      new Date("2026-11-08T10:00:00.000Z"),
    );
    expect(
      offlineOccurredAt(
        new Date(now.getTime() - OFFLINE_MAX_AGE_MS).toISOString(),
        now,
      ),
    ).toBeInstanceOf(Date);
  });

  it("rechaza fechas futuras (reloj de la PC adelantado), viejas o inválidas", () => {
    expect(() => offlineOccurredAt("2026-11-08T15:10:00.000Z", now)).toThrow(
      "fecha futura",
    );
    expect(() =>
      offlineOccurredAt(
        new Date(now.getTime() - OFFLINE_MAX_AGE_MS - 1).toISOString(),
        now,
      ),
    ).toThrow("7 días");
    expect(() => offlineOccurredAt("ayer", now)).toThrow("no es válida");
  });

  it("la huella no depende del orden de los campos ni de cuándo se mandó", () => {
    const venta = {
      documentType: "INTERNAL",
      customerId: undefined,
      items: [{ productId: "p", quantity: 1, expectedUnitPriceMinor: "100" }],
      payments: [{ method: "CASH", amountMinor: 100 }],
    };
    const desordenada = {
      payments: [{ amountMinor: 100, method: "CASH" }],
      items: [{ expectedUnitPriceMinor: "100", quantity: 1, productId: "p" }],
    };
    expect(offlineRequestHash(venta)).toBe(offlineRequestHash(desordenada));
    expect(offlineRequestHash(venta)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la huella cambia si cambia el contenido", () => {
    const base = {
      items: [{ productId: "p", quantity: 1 }],
      payments: [{ method: "CASH", amountMinor: 100 }],
    };
    expect(offlineRequestHash(base)).not.toBe(
      offlineRequestHash({
        ...base,
        items: [{ productId: "p", quantity: 2 }],
      }),
    );
  });

  it("arma una descripción válida para un producto que ya no se vende", () => {
    expect(offlineConceptName("Actron 600")).toBe("Actron 600");
    expect(offlineConceptName("AB")).toBe("Producto vendido sin conexión AB");
    expect(offlineConceptName(undefined)).toBe("Producto vendido sin conexión");
    expect(offlineConceptName("x".repeat(300))).toHaveLength(140);
  });
});
