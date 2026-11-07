import type { StatusTone } from "../data-table";

export type SubscriptionStage =
  | "EXEMPT"
  | "TRIAL"
  | "ACTIVE"
  | "EXTENDED"
  | "GRACE"
  | "READ_ONLY"
  | "BLOCKED"
  | "SUSPENDED"
  | "CANCELLED";

const stages: Record<SubscriptionStage, { label: string; tone: StatusTone }> = {
  EXEMPT: { label: "Exenta", tone: "muted" },
  TRIAL: { label: "En prueba", tone: "ok" },
  ACTIVE: { label: "Al día", tone: "ok" },
  EXTENDED: { label: "Con prórroga", tone: "warning" },
  GRACE: { label: "En gracia", tone: "warning" },
  READ_ONLY: { label: "Solo lectura", tone: "danger" },
  BLOCKED: { label: "Bloqueada", tone: "danger" },
  SUSPENDED: { label: "Suspendida", tone: "danger" },
  CANCELLED: { label: "Dada de baja", tone: "muted" },
};

export const stageLabel = (stage: SubscriptionStage) => stages[stage].label;
export const stageTone = (stage: SubscriptionStage) => stages[stage].tone;

export const stageFilterOptions = [
  { value: "ALL", label: "Todos los estados" },
  ...Object.entries(stages).map(([value, { label }]) => ({ value, label })),
];

type Row = {
  name: string;
  subscription: { stage: SubscriptionStage; feeMinor: string } | null;
};

const LATE: readonly SubscriptionStage[] = ["GRACE", "READ_ONLY", "BLOCKED"];

/** Lo que se cobra por mes: una farmacia dada de baja ya no suma. */
export function summarizeOrganizations(rows: readonly Row[]) {
  const billable = rows.filter(
    ({ subscription }) => subscription && subscription.stage !== "CANCELLED",
  );
  return {
    total: rows.length,
    trial: rows.filter(({ subscription }) => subscription?.stage === "TRIAL")
      .length,
    late: rows.filter(
      ({ subscription }) => subscription && LATE.includes(subscription.stage),
    ).length,
    monthlyMinor: billable
      .reduce((sum, row) => sum + BigInt(row.subscription!.feeMinor), 0n)
      .toString(),
  };
}

export function filterOrganizations<T extends Row>(
  rows: readonly T[],
  search: string,
  stage: string,
): T[] {
  const query = search.trim().toLocaleLowerCase("es-AR");
  return rows.filter(
    (row) =>
      (stage === "ALL" || row.subscription?.stage === stage) &&
      row.name.toLocaleLowerCase("es-AR").includes(query),
  );
}

/** Una farmacia exenta no tiene cupo: mostrar "3 / 1" parecería un exceso. */
export function usageLabel(
  used: number,
  quota: number,
  exempt: boolean,
  separator = " / ",
): string {
  return exempt ? String(used) : `${used}${separator}${quota}`;
}

/** Hasta cuándo está cubierta, para ver de un vistazo a quién hay que contactar. */
export function coveredUntilLabel(subscription: {
  exempt: boolean;
  trialEndsAt: string | null;
  paidThrough: string | null;
  extendedUntil: string | null;
}): string {
  if (subscription.exempt) return "Sin vencimiento";
  const date = [
    subscription.paidThrough,
    subscription.trialEndsAt,
    subscription.extendedUntil,
  ]
    .flatMap((value) => value ?? [])
    .sort()
    .at(-1);
  if (!date) return "Sin fecha";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
