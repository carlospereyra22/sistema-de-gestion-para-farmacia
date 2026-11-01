import type { PrismaService } from "../prisma/prisma.service";

type Totals = {
  count: number;
  expectedMinor: bigint;
  countedMinor: bigint;
  differenceMinor: bigint;
};

/** Fecha civil de Argentina (YYYY-MM-DD) de un instante. */
export function argentineDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const serialize = (groups: Map<string, Totals>) =>
  [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, item]) => ({
      period,
      count: item.count,
      expectedMinor: item.expectedMinor.toString(),
      countedMinor: item.countedMinor.toString(),
      differenceMinor: item.differenceMinor.toString(),
    }));

/**
 * Cierres de caja de las sucursales indicadas, agrupados por dia y mes de cierre.
 * Esperado = fondo inicial + cobros en efectivo de ventas completadas + ingresos
 * manuales − egresos manuales; diferencia = contado − esperado.
 */
export async function cashClosureSummary(
  prisma: PrismaService,
  branchIds: string[],
  closedAt: { gte: Date; lt?: Date; lte?: Date },
) {
  const registerIds = (
    await prisma.cashRegister.findMany({
      where: { branchId: { in: branchIds } },
      select: { id: true },
    })
  ).map((register) => register.id);
  const closures = await prisma.cashSession.findMany({
    where: {
      closedAt: { not: null, ...closedAt },
      cashRegisterId: { in: registerIds },
    },
    select: {
      id: true,
      closedAt: true,
      openingAmountMinor: true,
      closingAmountMinor: true,
      movements: { select: { type: true, amountMinor: true } },
    },
  });
  const closurePayments = closures.length
    ? await prisma.salePayment.groupBy({
        by: ["cashSessionId"],
        where: {
          cashSessionId: { in: closures.map((closure) => closure.id) },
          method: "CASH",
          sale: { status: "COMPLETED" },
        },
        _sum: { amountMinor: true },
      })
    : [];
  const cashBySession = new Map(
    closurePayments.map((payment) => [
      payment.cashSessionId,
      payment._sum.amountMinor ?? 0n,
    ]),
  );
  const daily = new Map<string, Totals>();
  const monthly = new Map<string, Totals>();
  const total: Totals = {
    count: 0,
    expectedMinor: 0n,
    countedMinor: 0n,
    differenceMinor: 0n,
  };
  for (const closure of closures) {
    const manual = closure.movements.reduce(
      (sum, movement) =>
        sum +
        (movement.type === "IN" ? movement.amountMinor : -movement.amountMinor),
      0n,
    );
    const expected =
      closure.openingAmountMinor +
      (cashBySession.get(closure.id) ?? 0n) +
      manual;
    const counted = closure.closingAmountMinor ?? 0n;
    const day = argentineDateKey(closure.closedAt!);
    for (const [key, target] of [
      [day, daily],
      [day.slice(0, 7), monthly],
    ] as const) {
      const previous = target.get(key) ?? {
        count: 0,
        expectedMinor: 0n,
        countedMinor: 0n,
        differenceMinor: 0n,
      };
      target.set(key, {
        count: previous.count + 1,
        expectedMinor: previous.expectedMinor + expected,
        countedMinor: previous.countedMinor + counted,
        differenceMinor: previous.differenceMinor + counted - expected,
      });
    }
    total.count += 1;
    total.expectedMinor += expected;
    total.countedMinor += counted;
    total.differenceMinor += counted - expected;
  }
  return {
    count: total.count,
    expectedMinor: total.expectedMinor.toString(),
    countedMinor: total.countedMinor.toString(),
    differenceMinor: total.differenceMinor.toString(),
    daily: serialize(daily),
    monthly: serialize(monthly),
  };
}
