import {
  commercialToday,
  resolveSubscriptionAccess,
  type SubscriptionDates,
} from "./subscription-access";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const base: SubscriptionDates = {
  exempt: false,
  suspendedAt: null,
  cancelledAt: null,
  trialEndsAt: null,
  paidThrough: date("2026-11-01"),
  extendedUntil: null,
};
// 15:00 UTC son las 12:00 en Argentina: bien lejos del cambio de día comercial.
const noon = (day: string) => new Date(`${day}T15:00:00.000Z`);
const stage = (subscription: SubscriptionDates, day: string) =>
  resolveSubscriptionAccess(subscription, noon(day)).stage;

describe("commercialToday", () => {
  it("el día cambia a las 06:00 de Argentina, no a medianoche", () => {
    // 08:59 UTC son las 05:59 en Argentina; 09:00 UTC, las 06:00.
    expect(commercialToday(new Date("2026-11-07T08:59:00.000Z"))).toBe(
      "2026-11-06",
    );
    expect(commercialToday(new Date("2026-11-07T09:00:00.000Z"))).toBe(
      "2026-11-07",
    );
  });
});

describe("resolveSubscriptionAccess", () => {
  it("una farmacia exenta nunca se corta, aunque tenga todo vencido", () => {
    expect(
      resolveSubscriptionAccess(
        {
          ...base,
          exempt: true,
          paidThrough: date("2020-01-01"),
          suspendedAt: new Date(),
        },
        noon("2026-11-07"),
      ),
    ).toEqual({ stage: "EXEMPT", access: "FULL", daysOverdue: 0 });
  });

  it("el día pagado cuenta completo", () => {
    expect(stage(base, "2026-11-01")).toBe("ACTIVE");
  });

  it.each([
    ["2026-11-02", "GRACE", "FULL", 1],
    ["2026-11-11", "GRACE", "FULL", 10],
    ["2026-11-12", "READ_ONLY", "READ_ONLY", 11],
    ["2026-11-30", "READ_ONLY", "READ_ONLY", 29],
    ["2026-12-01", "BLOCKED", "BLOCKED", 30],
  ])("el %s queda en %s", (day, expected, access, daysOverdue) => {
    expect(resolveSubscriptionAccess(base, noon(day))).toEqual({
      stage: expected,
      access,
      daysOverdue,
    });
  });

  it("no cambia de etapa de madrugada, sino a las 06:00", () => {
    const paidDay11 = { ...base, paidThrough: date("2026-11-01") };
    // Madrugada del 12: sigue siendo el día comercial 11 de noviembre.
    expect(
      resolveSubscriptionAccess(paidDay11, new Date("2026-11-12T08:59:00.000Z"))
        .stage,
    ).toBe("GRACE");
    expect(
      resolveSubscriptionAccess(paidDay11, new Date("2026-11-12T09:00:00.000Z"))
        .stage,
    ).toBe("READ_ONLY");
  });

  it("la prueba da acceso completo hasta su último día", () => {
    const trial = {
      ...base,
      paidThrough: null,
      trialEndsAt: date("2026-11-20"),
    };
    expect(stage(trial, "2026-11-20")).toBe("TRIAL");
    expect(stage(trial, "2026-11-21")).toBe("GRACE");
  });

  it("la prórroga evita el corte mientras dure", () => {
    const extended = { ...base, extendedUntil: date("2026-12-15") };
    expect(stage(extended, "2026-12-10")).toBe("EXTENDED");
    expect(resolveSubscriptionAccess(extended, noon("2026-12-10")).access).toBe(
      "FULL",
    );
  });

  it("al terminar la prórroga los días se cuentan desde ella", () => {
    const extended = { ...base, extendedUntil: date("2026-12-15") };
    expect(resolveSubscriptionAccess(extended, noon("2026-12-20"))).toEqual({
      stage: "GRACE",
      access: "FULL",
      daysOverdue: 5,
    });
  });

  it("suspender y dar de baja cortan, aunque esté al día", () => {
    expect(stage({ ...base, suspendedAt: new Date() }, "2026-11-01")).toBe(
      "SUSPENDED",
    );
    expect(stage({ ...base, cancelledAt: new Date() }, "2026-11-01")).toBe(
      "CANCELLED",
    );
  });
});
