import type {
  ReportKpi,
  ReportKpiUnit,
  ReportUnavailableReason,
} from "@gestion/contracts";
import type { ReportRange } from "./report-period";

const DAY = 86400000;

/** Variacion % con un decimal; null si no hay base (anterior 0 o ausente). */
export function changePct(
  current: bigint | number,
  previous: bigint | number | null,
): number | null {
  if (previous === null) return null;
  const now = BigInt(current);
  const before = BigInt(previous);
  if (before === 0n) return null;
  const abs = before < 0n ? -before : before;
  return Number(((now - before) * 1000n) / abs) / 10;
}

/** Participacion % con un decimal; null si el total es 0. */
export function sharePct(part: bigint | number, total: bigint | number) {
  const whole = BigInt(total);
  return whole === 0n ? null : Number((BigInt(part) * 1000n) / whole) / 10;
}

export function kpi(
  unit: ReportKpiUnit,
  value: bigint | number,
  previous: bigint | number | null,
  extra: Partial<ReportKpi> = {},
): ReportKpi {
  return {
    unit,
    available: true,
    value: value.toString(),
    previous: previous === null ? null : previous.toString(),
    changePct: changePct(value, previous),
    ...extra,
  };
}

export function unavailableKpi(
  unit: ReportKpiUnit,
  reason: ReportUnavailableReason,
): ReportKpi {
  return {
    unit,
    available: false,
    unavailableReason: reason,
    value: null,
    previous: null,
    changePct: null,
  };
}

/** Division entera redondeada (centavos); null si el divisor es 0. */
export function divideRounded(numerator: bigint, divisor: bigint | number) {
  const by = BigInt(divisor);
  if (by === 0n) return null;
  return (numerator * 2n + by) / (by * 2n);
}

/** Hasta 3 meses se agrupa por dia; mas largo, por mes. */
export function trendGranularity(range: ReportRange): "day" | "month" {
  return (Date.parse(range.to) - Date.parse(range.from)) / DAY + 1 <= 92
    ? "day"
    : "month";
}

/** Claves de cada tramo del rango (YYYY-MM-DD; para meses, el dia 01). */
export function trendBuckets(range: ReportRange, unit: "day" | "month") {
  const buckets: string[] = [];
  if (unit === "day") {
    for (
      let day = Date.parse(range.from);
      day <= Date.parse(range.to);
      day += DAY
    )
      buckets.push(new Date(day).toISOString().slice(0, 10));
    return buckets;
  }
  const [fromYear, fromMonth] = range.from.split("-").map(Number) as [
    number,
    number,
  ];
  const last = range.to.slice(0, 7);
  for (let index = 0; ; index += 1) {
    const key = new Date(Date.UTC(fromYear, fromMonth - 1 + index, 1))
      .toISOString()
      .slice(0, 10);
    buckets.push(key);
    if (key.slice(0, 7) >= last) return buckets;
  }
}
