import type { ReactNode } from "react";
import { referenceMoney } from "./lib/medicine-search";

export function MedicinePresentationHeader() {
  return (
    <div className="mb-1 grid grid-cols-1 gap-1 text-xs text-slate-500 sm:grid-cols-[minmax(0,1fr)_11rem_9rem] sm:gap-5">
      <span className="hidden sm:block">Presentación</span>
      <span className="sm:text-right">Precio de referencia · ARS</span>
      <span className="hidden sm:block sm:text-right">Fecha informada</span>
    </div>
  );
}

export function MedicinePresentationRow({
  presentation,
  priceMinor,
  updatedAt,
  children,
}: {
  presentation: string;
  priceMinor: number | null;
  updatedAt: string | null;
  children?: ReactNode;
}) {
  return (
    <article className="grid grid-cols-1 gap-1.5 border-t border-slate-100 py-3 sm:grid-cols-[minmax(0,1fr)_11rem_9rem] sm:items-center sm:gap-x-5">
      <p className="min-w-0 text-sm font-medium text-slate-800">
        {presentation || "Presentación no informada"}
      </p>
      <p className="text-base font-semibold tabular-nums text-emerald-800 sm:text-right">
        {referenceMoney(priceMinor)}
      </p>
      <p className="text-xs text-slate-500 sm:text-right">
        <span className="sm:hidden">Fecha informada: </span>
        {updatedAt || "no disponible"}
      </p>
      {children && <div className="sm:col-span-3">{children}</div>}
    </article>
  );
}
