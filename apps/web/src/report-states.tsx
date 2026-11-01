import type { ReactElement, ReactNode } from "react";
import { AlertTriangle, ChartNoAxesCombined, RotateCcw } from "lucide-react";

export const reportCardClass =
  "rounded-xl border border-[#dce7ef] bg-white shadow-[0_3px_12px_rgb(25_56_74_/_3%)]";

/** Sin datos o dato no registrado: explica por que, nunca dibuja ceros ficticios. */
export function ReportEmptyState({
  title,
  description,
  icon = <ChartNoAxesCombined size={20} aria-hidden />,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
}): ReactElement {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
    >
      <span className="grid size-10 place-items-center rounded-full bg-[#e8faf5] text-[#087f70]">
        {icon}
      </span>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description ? (
        <p className="max-w-md text-xs leading-5 text-slate-500">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function ReportErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <div
      role="alert"
      className={`${reportCardClass} flex flex-col items-center gap-3 px-4 py-8 text-center`}
    >
      <span className="grid size-10 place-items-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle size={20} aria-hidden />
      </span>
      <p className="text-sm font-semibold text-slate-800">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cce8de] bg-white px-3 text-sm font-semibold text-[#087f70] hover:bg-[#f2fbf8]"
      >
        <RotateCcw size={15} aria-hidden />
        Reintentar
      </button>
    </div>
  );
}

/** Bloques grises mientras carga, con la misma grilla que el contenido final. */
export function ReportSkeleton({
  cards = 4,
}: {
  cards?: number;
}): ReactElement {
  return (
    <div aria-busy="true" aria-label="Cargando reportes" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className={`${reportCardClass} h-[104px] p-4`}>
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-6 w-32 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className={`${reportCardClass} h-64 animate-pulse`} />
    </div>
  );
}
