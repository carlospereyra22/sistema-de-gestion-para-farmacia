import type { ReactNode } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { reportCardClass } from "./report-states";

/**
 * Piezas visuales del panel de plataforma, con el mismo lenguaje que el
 * sistema de gestión: tarjetas `reportCardClass`, íconos en verde azulado y
 * títulos de 22 px.
 */

export type PlatformTone = "teal" | "amber" | "rose" | "sky" | "slate";

const iconTone: Record<PlatformTone, string> = {
  teal: "bg-[#e8faf5] text-[#087f70]",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  sky: "bg-sky-50 text-sky-700",
  slate: "bg-slate-100 text-slate-600",
};

/** Encabezado de una sección: ícono, título, explicación y acciones. */
export function PlatformPageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#cce8de] bg-white text-[#087f70] shadow-[0_3px_10px_rgb(8_127_112_/_8%)]"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-7 tracking-tight text-slate-900">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 max-w-3xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/** Indicador con ícono, como los de Inicio y Reportes. */
export function PlatformKpi({
  icon,
  label,
  value,
  hint,
  tone = "teal",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: PlatformTone;
}) {
  return (
    <article className={`${reportCardClass} flex gap-3 px-4 py-3.5`}>
      <span
        aria-hidden="true"
        className={`grid size-10 shrink-0 place-items-center rounded-full ${iconTone[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-xs font-semibold text-slate-600">
          {label}
        </h3>
        <p className="mt-1 truncate text-2xl font-bold leading-8 tracking-tight text-slate-900 tabular-nums">
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>
        )}
      </div>
    </article>
  );
}

/** Grilla de indicadores: 2 columnas en pantallas chicas, hasta 4 en grandes. */
export function PlatformKpis({
  children,
  columns = 4,
}: {
  children: ReactNode;
  columns?: 3 | 4;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${columns === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
    >
      {children}
    </div>
  );
}

/** Tarjeta con título, para agrupar una tabla o un formulario. */
export function PlatformPanel({
  icon,
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`${reportCardClass} min-w-0 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6eef3] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#e8faf5] text-[#087f70]"
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p className="text-xs leading-5 text-slate-500">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Mientras carga una sección. */
export function PlatformLoading({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className={`${reportCardClass} flex items-center gap-2.5 px-4 py-6 text-sm text-slate-500`}
    >
      <LoaderCircle
        size={18}
        aria-hidden="true"
        className="animate-spin text-[#087f70] motion-reduce:animate-none"
      />
      {children}
    </p>
  );
}

/** Error al cargar o guardar. */
export function PlatformError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
    >
      <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Estado vacío dentro de un panel. */
export function PlatformEmpty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-[#eef6f4] text-[#087f70]"
      >
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {children && (
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          {children}
        </p>
      )}
    </div>
  );
}

/** Cabecera grande de una ficha (detalle de una farmacia). */
export function PlatformHero({
  monogram,
  title,
  chips,
  status,
  actions,
}: {
  monogram: string;
  title: string;
  chips: { icon: ReactNode; text: string }[];
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      className={`${reportCardClass} relative overflow-hidden px-5 py-5 sm:px-6`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-[#e3f7f0] via-[#f1fbf8] to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[#d6f3ea]/60 blur-2xl"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#0a8a79] to-[#0b5a52] text-xl font-bold tracking-wide text-white shadow-[0_10px_24px_-12px_rgb(8_100_90_/_70%)] ring-4 ring-white"
          >
            {monogram}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-[24px] font-bold leading-8 tracking-tight text-slate-900">
                {title}
              </h1>
              {status}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              {chips.map(({ icon, text }) => (
                <li key={text} className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-[#087f70]">
                    {icon}
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </section>
  );
}

/** Cupo usado con una barrita: verde, ámbar al llegar al tope. */
export function PlatformUsage({
  used,
  quota,
  exempt,
}: {
  used: number;
  quota: number;
  exempt: boolean;
}) {
  if (exempt || quota <= 0)
    return <span className="tabular-nums text-slate-700">{used}</span>;
  const lleno = used >= quota;
  return (
    <span
      className="inline-flex flex-col items-end gap-1"
      title={`${used} de ${quota}`}
    >
      <span className="tabular-nums text-slate-700">
        {used}
        <span className="text-slate-400"> / {quota}</span>
      </span>
      <span
        aria-hidden="true"
        className="block h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"
      >
        <span
          className={`block h-full rounded-full ${lleno ? "bg-amber-500" : "bg-[#3fa392]"}`}
          style={{ width: `${Math.min(100, (used / quota) * 100)}%` }}
        />
      </span>
    </span>
  );
}
