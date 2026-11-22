import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { prefiereMenosMovimiento } from "./lib/animacion-reportes";
import { useEntrada } from "./lib/use-reportes-movimiento";
import { reportCardClass } from "./report-states";

/**
 * Piezas visuales propias de las pestañas de Reportes (SISTEMA-117): cada
 * pestaña tiene su pieza central en vez de repetir la grilla del Resumen.
 * Colores sólo de Tailwind (con su par oscuro) o del tema de los gráficos.
 */

/** Encabezado de una sección dentro de una pestaña (Fidelidad, Cuenta corriente). */
export function ReportSection({
  icon,
  title,
  description,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-marca-970 text-marca-535 ring-1 ring-inset ring-marca-908">
            {icon}
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description ? (
              <p className="text-xs text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>
        {badge}
      </header>
      {children}
    </section>
  );
}

/** Chip informativo (cobertura de datos, por ejemplo). */
export function ReportChip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warn" | "good";
  children: ReactNode;
}): ReactElement {
  const tones = {
    neutral: "border-slate-200 bg-white text-slate-600",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Anillo de porcentaje en SVG. Con la entrada animada se completa desde 0 con
 * la curva de los números; sin ella (o con "reducir movimiento"), directo.
 */
export function ReportRing({
  value,
  color,
  label,
  size = 132,
  animar = false,
}: {
  /** 0 a 100; null = sin dato. */
  value: number | null;
  /** Clase de color del trazo (text-*): se usa `currentColor`. */
  color: string;
  label: ReactNode;
  size?: number;
  animar?: boolean;
}): ReactElement {
  const radius = 52;
  const length = 2 * Math.PI * radius;
  const target = Math.max(0, Math.min(100, value ?? 0));
  const [shown, setShown] = useState(
    animar && !prefiereMenosMovimiento() ? 0 : target,
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 120 120"
        className="-rotate-90"
        width={size}
        height={size}
        aria-hidden
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="11"
          className="stroke-slate-100"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          stroke="currentColor"
          className={`${color} transition-[stroke-dashoffset] duration-[1800ms] ease-[cubic-bezier(0.16,1,0.3,1)]`}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - shown / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {value === null
              ? "—"
              : `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`}
          </p>
          <p className="mx-auto max-w-[90px] text-[10px] leading-3 text-slate-500">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Cifra destacada con su explicación, para las piezas centrales. */
export function ReportStat({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "neutral" | "good" | "bad";
}): ReactElement {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-xl font-semibold tabular-nums ${
          tone === "good"
            ? "text-emerald-700"
            : tone === "bad"
              ? "text-rose-600"
              : "text-slate-900"
        }`}
        title={value}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 text-[11px] text-slate-500">{detail}</p>
      ) : null}
    </div>
  );
}

export type StackedPart = {
  id: string;
  label: string;
  value: number;
  /** Clase de fondo (bg-*). */
  color: string;
  detail?: string;
};

/**
 * Barra apilada en HTML con su leyenda: partes de un todo con significado
 * (segmentos de clientes, salud del stock). Crece desde la izquierda en la
 * primera entrada.
 */
export function ReportStackedBar({
  parts,
  label,
  unit,
}: {
  parts: readonly StackedPart[];
  label: string;
  /** "clientes", "productos"... */
  unit: string;
}): ReactElement {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${parts.map((part) => `${part.label} ${part.value}`).join(", ")}`}
        className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100"
      >
        {total
          ? parts
              .filter((part) => part.value > 0)
              .map((part, index) => (
                <span
                  key={part.id}
                  className={`reportes-barra h-full ${part.color} ${index ? "border-l-2 border-white" : ""}`}
                  style={
                    {
                      width: `${(part.value / total) * 100}%`,
                      "--fila": index,
                    } as CSSProperties
                  }
                  title={`${part.label}: ${part.value}`}
                />
              ))
          : null}
      </div>
      <ul className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {parts.map((part) => (
          <li key={part.id} className="flex min-w-0 items-start gap-2 text-xs">
            <span
              className={`mt-1 size-2.5 shrink-0 rounded-sm ${part.color}`}
            />
            <span className="min-w-0 flex-1">
              <span className="flex justify-between gap-2">
                <span className="truncate text-slate-700">{part.label}</span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {part.value.toLocaleString("es-AR")}
                  <span className="ml-1 font-normal text-slate-400">
                    {total ? `${Math.round((part.value / total) * 100)} %` : ""}
                  </span>
                </span>
              </span>
              {part.detail ? (
                <span className="block text-[11px] text-slate-500">
                  {part.detail}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="sr-only">
        Total: {total} {unit}
      </p>
    </div>
  );
}

/** Tarjeta destacada (pieza central) con entrada animada, sin título fijo. */
export function ReportHero({
  animar = false,
  className = "",
  children,
}: {
  animar?: boolean;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const [ref, estado] = useEntrada<HTMLElement>(animar);
  return (
    <section
      ref={ref}
      data-entrada={estado}
      className={`${reportCardClass} reportes-entrada reportes-panel overflow-hidden p-5 ${className}`}
    >
      {children}
    </section>
  );
}

const cohortMonth = (month: string) =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString("es-AR", {
    month: "short",
    year: "2-digit",
  });

/**
 * Cohortes de retención: cada fila, los clientes que compraron por primera vez
 * ese mes; cada columna, el % que volvió N meses después. Más oscuro, más
 * vuelven.
 */
export function ReportCohortTable({
  cohorts,
}: {
  cohorts: readonly {
    month: string;
    customers: number;
    retention: readonly (number | null)[];
  }[];
}): ReactElement {
  const shade = (value: number) =>
    value >= 60
      ? "bg-teal-700 text-white"
      : value >= 40
        ? "bg-teal-500 text-white"
        : value >= 25
          ? "bg-teal-300 text-teal-950"
          : value >= 10
            ? "bg-teal-100 text-teal-900"
            : value > 0
              ? "bg-teal-50 text-teal-800"
              : "bg-slate-50 text-slate-400";
  const columns = Math.max(0, ...cohorts.map((row) => row.retention.length));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr className="text-[11px] text-slate-500">
            <th className="px-2 py-1 text-left font-semibold">
              Primera compra
            </th>
            <th className="px-2 py-1 text-right font-semibold">Clientes</th>
            {Array.from({ length: columns }, (_, index) => (
              <th key={index} className="px-2 py-1 text-center font-semibold">
                Mes {index + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((row, index) => (
            <tr
              key={row.month}
              className="reportes-fila"
              style={{ "--fila": index } as CSSProperties}
            >
              <td className="px-2 py-1.5 font-medium capitalize text-slate-700">
                {cohortMonth(row.month)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                {row.customers}
              </td>
              {row.retention.map((value, column) => (
                <td
                  key={column}
                  className={`rounded-md px-2 py-1.5 text-center tabular-nums ${
                    value === null ? "text-slate-300" : shade(value)
                  }`}
                  title={
                    value === null
                      ? "Todavía no pasó ese mes"
                      : `${value.toLocaleString("es-AR")} % volvió a comprar en el mes ${column + 1}`
                  }
                >
                  {value === null ? "·" : `${Math.round(value)} %`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
