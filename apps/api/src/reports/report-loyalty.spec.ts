import {
  addMonths,
  cohorts,
  frequencyBucket,
  loyaltySegment,
  loyaltySummary,
  median,
  usualDays,
  type LoyaltyCustomer,
} from "./report-loyalty";

const reference = new Date("2026-11-22T12:00:00Z");
const periodStart = new Date("2026-10-24T03:00:00Z");
const day = (iso: string) => new Date(`${iso}T15:00:00Z`);

const customer = (
  patch: Partial<LoyaltyCustomer> & { id: string },
): LoyaltyCustomer => ({
  name: patch.id,
  firstAt: day("2026-06-01"),
  firstMonth: "2026-06",
  lastAt: day("2026-11-20"),
  lifetime: 5,
  visits: 5,
  lifetimeSpend: 100000n,
  inPeriod: 1,
  periodSpend: 20000n,
  inPrevious: 0,
  ...patch,
});

describe("fidelidad de clientes (SISTEMA-117)", () => {
  it("frecuencia habitual = días entre la primera y la última / visitas − 1", () => {
    expect(
      usualDays({
        firstAt: day("2026-10-01"),
        lastAt: day("2026-10-31"),
        visits: 4,
      }),
    ).toBe(10);
    expect(
      usualDays({
        firstAt: day("2026-10-01"),
        lastAt: day("2026-10-01"),
        visits: 1,
      }),
    ).toBeNull();
  });

  it("segmenta por la frecuencia de cada cliente, no por una regla fija", () => {
    // Compra cada 10 días y hace 20 que no viene: 20 > 1,5 × 10 pero no supera
    // el mínimo de 30 días, sigue activo.
    const frequent = customer({
      id: "a",
      firstAt: day("2026-08-03"),
      lastAt: day("2026-11-02"),
      lifetime: 10,
      visits: 10,
    });
    expect(loyaltySegment(frequent, reference, periodStart)).toBe("frequent");
    // Compraba cada 10 días y hace 45 que no vuelve: en riesgo.
    const late = customer({
      id: "b",
      firstAt: day("2026-07-10"),
      lastAt: day("2026-10-08"),
      lifetime: 10,
      visits: 10,
    });
    expect(loyaltySegment(late, reference, periodStart)).toBe("atRisk");
    // Compra cada 60 días y hace 45: todavía en su ritmo.
    const slow = customer({
      id: "c",
      firstAt: day("2026-04-01"),
      lastAt: day("2026-10-08"),
      lifetime: 4,
      visits: 4,
    });
    expect(loyaltySegment(slow, reference, periodStart)).toBe("regular");
    expect(
      loyaltySegment(
        customer({ id: "d", lastAt: day("2026-06-01") }),
        reference,
        periodStart,
      ),
    ).toBe("lost");
    expect(
      loyaltySegment(
        customer({
          id: "e",
          firstAt: day("2026-11-10"),
          lastAt: day("2026-11-10"),
          lifetime: 1,
          visits: 1,
        }),
        reference,
        periodStart,
      ),
    ).toBe("new");
    // Una sola compra hace más de 60 días: no volvió.
    expect(
      loyaltySegment(
        customer({
          id: "f",
          firstAt: day("2026-09-01"),
          lastAt: day("2026-09-01"),
          lifetime: 1,
          visits: 1,
        }),
        reference,
        periodStart,
      ),
    ).toBe("atRisk");
  });

  it("dos tickets el mismo día son una visita: nunca 'cada 0 días'", () => {
    // 3 visitas en 20 días (aunque hayan sido 6 tickets): cada 10 días.
    expect(
      usualDays({
        firstAt: day("2026-10-01"),
        lastAt: day("2026-10-21"),
        visits: 3,
      }),
    ).toBe(10);
    // Dos visitas en días seguidos: al menos 1 día.
    expect(
      usualDays({
        firstAt: day("2026-10-01"),
        lastAt: day("2026-10-01"),
        visits: 2,
      }),
    ).toBe(1);
  });

  it("frecuencias y mediana", () => {
    expect(frequencyBucket(null)).toBe("once");
    expect(frequencyBucket(6)).toBe("7");
    expect(frequencyBucket(30)).toBe("30");
    expect(frequencyBucket(200)).toBe("more");
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20])).toBe(15);
    expect(median([])).toBeNull();
  });

  it("cohortes: % que volvió cada mes, sin inventar meses que no llegaron", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    const months = new Map([
      ["a", new Set(["2026-09", "2026-10", "2026-11"])],
      ["b", new Set(["2026-09", "2026-11"])],
      ["c", new Set(["2026-10"])],
    ]);
    const first = new Map([
      ["a", "2026-09"],
      ["b", "2026-09"],
      ["c", "2026-10"],
    ]);
    const result = cohorts(months, first, "2026-11", 6, 3);
    expect(result).toEqual([
      { month: "2026-09", customers: 2, retention: [50, 100, null] },
      { month: "2026-10", customers: 1, retention: [0, null, null] },
    ]);
  });

  it("resume recompra, retención y clientes para recuperar", () => {
    const summary = loyaltySummary({
      customers: [
        customer({ id: "vuelve", inPeriod: 2, inPrevious: 1 }),
        customer({
          id: "nuevo",
          firstAt: day("2026-11-01"),
          firstMonth: "2026-11",
          lastAt: day("2026-11-01"),
          lifetime: 1,
          visits: 1,
          inPeriod: 1,
        }),
        customer({
          id: "se fue",
          lastAt: day("2026-09-20"),
          inPeriod: 0,
          inPrevious: 1,
          lifetimeSpend: 900000n,
        }),
      ],
      reference,
      periodStart,
      hasPrevious: true,
      newVsReturning: [],
      months: new Map(),
      lastMonth: "2026-11",
      identifiedSharePct: 18.5,
    });
    expect(summary).toMatchObject({
      returningPct: 50,
      retentionPct: 50,
      newCustomers: 1,
      returningCustomers: 1,
      purchasesPerCustomer: 1.5,
      identifiedSharePct: 18.5,
    });
    expect(summary.toRecover.map((row) => row.name)).toEqual(["se fue"]);
    expect(
      summary.segments.reduce((sum, segment) => sum + segment.customers, 0),
    ).toBe(3);
  });
});
