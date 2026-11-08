import type { CashSession } from "./api";

export const cashMoney = (minor: string | bigint) =>
  (Number(minor) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });

const shortId = (reason: string) =>
  /[0-9a-f]{8}(?=-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(
    reason,
  )?.[0] ?? "";

type Movement = CashSession["movements"][number];

function movementLabel({ category, reason }: Movement): string {
  const id = shortId(reason);
  switch (category) {
    case "SALE_CHANGE":
      return `Vuelto · Venta ${id}`;
    case "SALE_CHANGE_REVERSAL":
      return `Anulación de vuelto · Venta ${id}`;
    case "ACCOUNT_COLLECTION":
      return reason.replace(/ · Recibo [0-9a-f-]+$/, "");
    case "PENDING_ASSIGNMENT":
      return `Cobro incorporado · ${/Recibo/.test(reason) ? "Recibo" : "Venta"} ${id}`;
    case "PENDING_REVERSAL":
      return `Anulación de cobro · Venta ${id}`;
    case "CREDIT_NOTE":
      return `Nota de crédito · ${id}`;
    default:
      return reason || "Movimiento sin motivo";
  }
}

export type CashTimelineEntry = {
  id: string;
  date: string;
  label: string;
  actor: string;
  amountMinor: string;
  out: boolean;
};

/** Todo lo que movió efectivo, del más reciente al más antiguo. */
export function cashTimeline(
  session: Pick<CashSession, "movements" | "cashPayments">,
): CashTimelineEntry[] {
  return [
    ...session.movements.map((movement) => ({
      id: movement.id,
      date: movement.createdAt,
      label: movementLabel(movement),
      actor: movement.actorName ?? "—",
      amountMinor: movement.amountMinor,
      out: movement.type === "OUT",
    })),
    ...(session.cashPayments ?? []).map((payment) => ({
      id: payment.id,
      date: payment.createdAt,
      label: `Venta · ${payment.saleId.slice(0, 8)}`,
      actor: payment.actorName ?? "—",
      amountMinor: payment.amountMinor,
      out: false,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** Separa lo cobrado de lo retirado; junto con el fondo da el esperado de la API. */
export function cashSessionTotals(session: CashSession) {
  const total = (categories: string[], type: "IN" | "OUT") =>
    session.movements
      .filter(
        (movement) =>
          movement.type === type &&
          categories.includes(movement.category ?? "MANUAL"),
      )
      .reduce((sum, movement) => sum + BigInt(movement.amountMinor), 0n);
  return {
    collectedMinor:
      BigInt(session.cashSalesMinor) -
      BigInt(session.saleChangeMinor) +
      total(["ACCOUNT_COLLECTION", "PENDING_ASSIGNMENT"], "IN") -
      total(["PENDING_REVERSAL"], "OUT"),
    otherInMinor: total(["MANUAL"], "IN"),
    outflowsMinor: total(["MANUAL", "CREDIT_NOTE"], "OUT"),
  };
}

export function cashDifferenceView(minor: string | number | null) {
  const value = BigInt(minor ?? 0);
  if (value === 0n)
    return { label: "Sin diferencia", amount: cashMoney(0n), tone: "even" };
  return {
    label: value < 0n ? "Faltante" : "Sobrante",
    amount: cashMoney(value < 0n ? -value : value),
    tone: value < 0n ? "short" : "over",
  } as const;
}

const argentinaDate = (date: Date) =>
  date.toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });

/** Los mismos 30 días que aplica la API cuando no recibe fechas. */
export function defaultClosureRange(now: Date) {
  return {
    from: argentinaDate(new Date(now.getTime() - 29 * 86_400_000)),
    to: argentinaDate(now),
  };
}

type AssignedCollection = { destinationRegisterId: string | null };

export function hasAssignedCollections(
  rows: AssignedCollection[],
  registerId: string,
) {
  return rows.some((row) => row.destinationRegisterId === registerId);
}

/** Los cobros de la caja elegida van primero; el resto conserva su orden. */
export function assignedCollectionsFirst<T extends AssignedCollection>(
  rows: T[],
  registerId: string,
): T[] {
  return [
    ...rows.filter((row) => row.destinationRegisterId === registerId),
    ...rows.filter((row) => row.destinationRegisterId !== registerId),
  ];
}

export function pendingCollectionsSummary(
  rows: { cashMinor: string; cardMinor: string; transferMinor: string }[],
) {
  return {
    count: rows.length,
    totalMinor: rows.reduce(
      (sum, row) =>
        sum +
        BigInt(row.cashMinor) +
        BigInt(row.cardMinor) +
        BigInt(row.transferMinor),
      0n,
    ),
  };
}
