import { useState, type ReactElement } from "react";
import { Wallet } from "lucide-react";
import type {
  ReportCashClosureGroup,
  ReportCashClosures,
} from "@gestion/contracts";
import { formatMoneyMinor } from "./lib/report-format";
import { Pagination } from "./pagination";
import { reportCardClass } from "./report-states";

/** Tabla paginada, del periodo mas reciente al mas viejo. */
function ClosureTable({
  title,
  groups,
  monthly = false,
}: {
  title: string;
  groups: ReportCashClosureGroup[];
  monthly?: boolean;
}): ReactElement {
  const pageSize = monthly ? 12 : 10;
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const [requested, setPage] = useState(1);
  const page = Math.min(requested, totalPages);
  const rows = [...groups]
    .reverse()
    .slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <h3 className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700">
        {title}
      </h3>
      {groups.length ? (
        <table className="w-full min-w-[400px] text-sm">
          <thead className="bg-[#f6faf9] text-left text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Período</th>
              <th className="px-2 py-2 text-right font-semibold">Cierres</th>
              <th className="px-2 py-2 text-right font-semibold">Esperado</th>
              <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((group) => (
              <tr key={group.period} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {monthly
                    ? new Date(
                        `${group.period}-01T12:00:00`,
                      ).toLocaleDateString("es-AR", {
                        month: "long",
                        year: "numeric",
                      })
                    : new Date(`${group.period}T12:00:00`).toLocaleDateString(
                        "es-AR",
                      )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {group.count}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatMoneyMinor(group.expectedMinor)}
                </td>
                <td
                  className={`px-4 py-2 text-right font-semibold tabular-nums ${
                    group.differenceMinor === "0"
                      ? "text-[#087f70]"
                      : "text-rose-600"
                  }`}
                >
                  {formatMoneyMinor(group.differenceMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {groups.length > pageSize ? (
        <Pagination
          integrated
          total={groups.length}
          currentPage={page}
          totalPages={totalPages}
          pageSize={pageSize}
          noun={monthly ? "meses" : "días"}
          label={`Páginas de cierres ${monthly ? "por mes" : "por día"}`}
          onChange={setPage}
        />
      ) : null}
      {groups.length ? null : (
        <p className="px-4 py-4 text-sm text-slate-500">
          Sin cierres para este período.
        </p>
      )}
    </div>
  );
}

/** Totales de cierres de caja del periodo para las sucursales elegidas. */
export function ReportCashClosuresPanel({
  closures,
}: {
  closures: ReportCashClosures;
}): ReactElement {
  return (
    <section className={`${reportCardClass} p-4`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Wallet size={16} className="text-[#087f70]" aria-hidden />
        Cierres de caja ({closures.count})
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(
          [
            ["Efectivo esperado", closures.expectedMinor],
            ["Efectivo contado", closures.countedMinor],
            ["Diferencia acumulada", closures.differenceMinor],
          ] as const
        ).map(([label, amount]) => (
          <div key={label} className="rounded-lg bg-[#f6faf9] px-3 py-2">
            <p className="text-[11px] font-semibold text-slate-500">{label}</p>
            <p className="text-base font-bold tabular-nums">
              {formatMoneyMinor(amount)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <ClosureTable title="Por día" groups={closures.daily} />
        <ClosureTable title="Por mes" groups={closures.monthly} monthly />
      </div>
    </section>
  );
}
