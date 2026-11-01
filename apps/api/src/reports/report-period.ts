import { BadRequestException } from "@nestjs/common";
import { REPORT_DEFAULTS, type ReportComparison } from "@gestion/contracts";

const DAY = 86400000;
// Argentina no usa horario de verano: 00:00 local = 03:00 UTC.
const OFFSET = 3 * 3600000;
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ReportRange = {
  /** Fechas civiles inclusivas (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Instantes para consultar: `[start, end)`. */
  start: Date;
  end: Date;
};

export type ReportPeriod = ReportRange & {
  comparison: ReportComparison;
  previous: ReportRange | null;
};

/** Fecha civil de Argentina para un instante. */
export function argentineDate(now: Date) {
  return new Date(now.getTime() - OFFSET).toISOString().slice(0, 10);
}

function civilDay(value: string, label: string) {
  const match = CIVIL_DATE.exec(value);
  const day = match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : NaN;
  if (!match || new Date(day).toISOString().slice(0, 10) !== value)
    throw new BadRequestException(
      `La fecha ${label} no es válida. Usá el formato AAAA-MM-DD.`,
    );
  return day;
}

const civil = (day: number) => new Date(day).toISOString().slice(0, 10);

function range(fromDay: number, toDay: number): ReportRange {
  return {
    from: civil(fromDay),
    to: civil(toDay),
    start: new Date(fromDay + OFFSET),
    end: new Date(toDay + DAY + OFFSET),
  };
}

/** Mismo dia del ano anterior; el 29/02 pasa a 28/02. */
function yearBefore(day: number) {
  const date = new Date(day);
  const target = Date.UTC(
    date.getUTCFullYear() - 1,
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return new Date(target).getUTCMonth() === date.getUTCMonth()
    ? target
    : Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth() + 1, 0);
}

/**
 * Resuelve el periodo de un reporte. Sin fechas usa los ultimos 30 dias hasta hoy.
 * `from`/`to` son inclusivos para el usuario; el resultado consulta `[start, end)`.
 */
export function parseReportPeriod(
  input: { from?: string; to?: string; comparison?: ReportComparison },
  now = new Date(),
): ReportPeriod {
  const today = civilDay(argentineDate(now), "de hoy");
  const toDay = input.to ? civilDay(input.to, "Hasta") : today;
  const fromDay = input.from
    ? civilDay(input.from, "Desde")
    : toDay - (REPORT_DEFAULTS.rangeDays - 1) * DAY;
  if (fromDay > toDay)
    throw new BadRequestException(
      "La fecha Desde no puede ser posterior a Hasta.",
    );
  if (toDay > today)
    throw new BadRequestException("La fecha Hasta no puede ser futura.");
  const days = (toDay - fromDay) / DAY + 1;
  if (days > REPORT_DEFAULTS.maxRangeDays)
    throw new BadRequestException(
      `El período no puede superar ${REPORT_DEFAULTS.maxRangeDays} días.`,
    );
  const comparison = input.comparison ?? REPORT_DEFAULTS.comparison;
  const previous =
    comparison === "previous"
      ? range(fromDay - days * DAY, fromDay - DAY)
      : comparison === "yearAgo"
        ? range(yearBefore(fromDay), yearBefore(toDay))
        : null;
  return { ...range(fromDay, toDay), comparison, previous };
}
