import {
  addDays,
  addMonthsFromAnchor,
  chargePeriod,
  nextChargeAction,
  settleLedger,
} from "./subscription-ledger";

const charge = (
  periodStart: string,
  periodEnd: string,
  amountMinor = 10000n,
  waived = false,
) => ({ id: periodStart, periodStart, periodEnd, amountMinor, waived });

const november = charge("2026-11-21", "2026-12-20");
const december = charge("2026-12-21", "2027-01-20");
const january = charge("2027-01-21", "2027-02-20");

const paid = (amountMinor: bigint, voided = false) => ({
  amountMinor,
  voided,
});

describe("períodos", () => {
  it("cuenta días cruzando el año", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("un mes termina el día anterior al siguiente", () => {
    expect(chargePeriod("2026-11-21", 0)).toEqual({
      periodStart: "2026-11-21",
      periodEnd: "2026-12-20",
    });
    expect(chargePeriod("2026-11-21", 1)).toEqual({
      periodStart: "2026-12-21",
      periodEnd: "2027-01-20",
    });
  });

  it("un ancla el 31 cae el último día de febrero y vuelve al 31", () => {
    expect(addMonthsFromAnchor("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsFromAnchor("2027-01-31", 2)).toBe("2027-03-31");
    expect(addMonthsFromAnchor("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("los períodos no dejan días sueltos ni se superponen", () => {
    for (let index = 0; index < 24; index += 1) {
      const current = chargePeriod("2027-01-31", index);
      const next = chargePeriod("2027-01-31", index + 1);
      expect(addDays(current.periodEnd, 1)).toBe(next.periodStart);
    }
  });
});

describe("nextChargeAction", () => {
  const state = {
    blocked: true,
    hasCharges: true,
    balanceMinor: 0n,
    periodEnd: "2026-10-20",
    today: "2026-11-07",
  };

  it("una farmacia sin bloquear sigue generando cargos", () => {
    expect(
      nextChargeAction({ ...state, blocked: false, balanceMinor: 5000n }),
    ).toBe("CHARGE");
  });

  it("una bloqueada con deuda deja de acumular", () => {
    expect(nextChargeAction({ ...state, balanceMinor: 1n })).toBe("STOP");
  });

  it("la primera deuda se genera aunque ya esté bloqueada", () => {
    expect(nextChargeAction({ ...state, hasCharges: false })).toBe("CHARGE");
  });

  it("si saldó todo, condona los meses que pasó sin servicio", () => {
    expect(nextChargeAction(state)).toBe("WAIVE");
  });

  it("si saldó todo, el mes en curso se cobra", () => {
    expect(nextChargeAction({ ...state, periodEnd: "2026-11-07" })).toBe(
      "CHARGE",
    );
  });
});

describe("settleLedger", () => {
  it("sin pagos debe todo y no cubre nada", () => {
    expect(settleLedger([november], [])).toMatchObject({
      balanceMinor: 10000n,
      creditMinor: 0n,
      paidThrough: null,
    });
  });

  it("el pago exacto cubre el período", () => {
    expect(settleLedger([november], [paid(10000n)])).toMatchObject({
      balanceMinor: 0n,
      paidThrough: "2026-12-20",
    });
  });

  it("un pago parcial baja el saldo pero no adelanta la fecha", () => {
    const result = settleLedger([november], [paid(6000n)]);

    expect(result.balanceMinor).toBe(4000n);
    expect(result.paidThrough).toBeNull();
    expect(result.charges[0]).toMatchObject({
      paidMinor: 6000n,
      balanceMinor: 4000n,
    });
  });

  it("dos pagos parciales completan el período", () => {
    expect(
      settleLedger([november], [paid(6000n), paid(4000n)]).paidThrough,
    ).toBe("2026-12-20");
  });

  it("imputa primero al cargo más viejo, aunque lleguen desordenados", () => {
    const result = settleLedger([january, november, december], [paid(15000n)]);

    expect(result.charges.map(({ paidMinor }) => paidMinor)).toEqual([
      10000n,
      5000n,
      0n,
    ]);
    expect(result.paidThrough).toBe("2026-12-20");
  });

  it("el excedente queda como crédito", () => {
    expect(settleLedger([november], [paid(13000n)])).toMatchObject({
      balanceMinor: 0n,
      creditMinor: 3000n,
    });
  });

  it("el crédito se aplica al cargo siguiente", () => {
    expect(
      settleLedger([november, december], [paid(13000n), paid(7000n)]),
    ).toMatchObject({
      balanceMinor: 0n,
      creditMinor: 0n,
      paidThrough: "2027-01-20",
    });
  });

  it("anular un pago lo deja de contar y la fecha retrocede", () => {
    expect(
      settleLedger([november, december], [paid(10000n), paid(10000n, true)]),
    ).toMatchObject({ balanceMinor: 10000n, paidThrough: "2026-12-20" });
  });

  it("un cargo condonado no se debe ni consume pagos", () => {
    const waived = charge("2026-11-21", "2026-12-20", 10000n, true);

    expect(settleLedger([waived, december], [paid(10000n)])).toMatchObject({
      balanceMinor: 0n,
      creditMinor: 0n,
      paidThrough: "2027-01-20",
    });
  });

  it("un cargo condonado también cubre su período", () => {
    expect(
      settleLedger([charge("2026-11-21", "2026-12-20", 10000n, true)], [])
        .paidThrough,
    ).toBe("2026-12-20");
  });

  it("un período impago frena la fecha aunque el siguiente esté condonado", () => {
    const waived = charge("2026-12-21", "2027-01-20", 10000n, true);

    expect(settleLedger([november, waived], []).paidThrough).toBeNull();
  });

  it("un cargo en cero queda cubierto sin pagos", () => {
    expect(
      settleLedger([charge("2026-11-21", "2026-12-20", 0n)], []).paidThrough,
    ).toBe("2026-12-20");
  });
});
