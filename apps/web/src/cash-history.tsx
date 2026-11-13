import type { ReactNode } from "react";
import { Eye, Filter, History, Store } from "lucide-react";
import type { CashClosure, CashRegister } from "./lib/api";
import { cashResponsibleLabel } from "./lib/cash-responsible";
import { cashDifferenceView, cashMoney } from "./lib/cash-session-view";
import { ProductFilterSelect } from "./product-filter-select";

const dateField =
  "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700";

export function CashHistory({
  closures,
  registers,
  from,
  to,
  registerId,
  archived,
  canArchive,
  rangeInvalid,
  onFrom,
  onTo,
  onRegister,
  onArchived,
  onView,
  actions,
}: {
  closures: CashClosure[];
  registers: Pick<CashRegister, "id" | "name">[];
  from: string;
  to: string;
  registerId: string;
  archived: boolean;
  canArchive: boolean;
  rangeInvalid: boolean;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onRegister: (value: string) => void;
  onArchived: (value: boolean) => void;
  onView: (id: string) => void;
  actions: (closure: CashClosure) => ReactNode;
}) {
  const rows = registerId
    ? closures.filter((closure) => closure.cashRegisterId === registerId)
    : closures;
  return (
    <section className="cash-card cash-closures">
      <h2 className="flex items-center gap-2 font-semibold">
        <History size={19} className="text-teal-700" />
        Historial de cierres
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Consultá el efectivo esperado, contado y la diferencia por cada cierre.
      </p>
      <div className="cash-history-filters">
        <label className="block text-xs text-slate-500">
          Desde
          <input
            type="date"
            aria-label="Desde"
            value={from}
            max={to || undefined}
            onChange={(event) => onFrom(event.target.value)}
            className={dateField}
          />
        </label>
        <label className="block text-xs text-slate-500">
          Hasta
          <input
            type="date"
            aria-label="Hasta"
            value={to}
            min={from || undefined}
            onChange={(event) => onTo(event.target.value)}
            className={dateField}
          />
        </label>
        <div className="text-xs text-slate-500">
          <span className="mb-1 block">Caja</span>
          <ProductFilterSelect
            compact
            label="Caja del cierre"
            icon={<Store size={15} aria-hidden />}
            value={registerId}
            options={[
              { value: "", label: "Todas las cajas" },
              ...registers.map((register) => ({
                value: register.id,
                label: register.name,
              })),
            ]}
            onChange={onRegister}
          />
        </div>
        {canArchive && (
          <div className="text-xs text-slate-500">
            <span className="mb-1 block">Estado</span>
            <ProductFilterSelect
              compact
              label="Estado de los cierres"
              icon={<Filter size={15} aria-hidden />}
              value={archived ? "archived" : "visible"}
              options={[
                { value: "visible", label: "Visibles" },
                { value: "archived", label: "Eliminados" },
              ]}
              onChange={(value) => onArchived(value === "archived")}
            />
          </div>
        )}
      </div>
      {rangeInvalid && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          La fecha Desde no puede ser posterior a Hasta.
        </p>
      )}
      <div className="mt-5 overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-y text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-3">Cierre</th>
                <th className="px-2 py-3">Caja</th>
                <th className="px-2 py-3">Responsable</th>
                <th className="px-2 py-3 text-right">Esperado</th>
                <th className="px-2 py-3 text-right">Contado</th>
                <th className="px-2 py-3 text-right">Diferencia</th>
                <th className="w-px whitespace-nowrap px-2 py-3 text-center">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((closure) => {
                const difference = cashDifferenceView(closure.differenceMinor);
                return (
                  <tr key={closure.id} className="border-b">
                    <td className="px-2 py-3">
                      {new Date(closure.closedAt!).toLocaleString("es-AR", {
                        hourCycle: "h23",
                      })}
                    </td>
                    <td className="px-2 py-3">{closure.cashRegisterName}</td>
                    <td className="px-2 py-3 text-xs text-slate-500">
                      {cashResponsibleLabel(closure)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {cashMoney(closure.expectedAmountMinor)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {cashMoney(closure.closingAmountMinor ?? "0")}
                    </td>
                    <td
                      className={`cash-difference is-${difference.tone} px-2 py-3 text-right`}
                    >
                      {difference.tone === "even" ? (
                        difference.label
                      ) : (
                        <>
                          <span className="block text-[11px] font-medium">
                            {difference.label}
                          </span>
                          {difference.amount}
                        </>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onView(closure.id)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                        >
                          <Eye size={15} aria-hidden /> Ver cierre
                        </button>
                        {actions(closure)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="py-5 text-sm text-slate-500">
            No hay cierres para el período seleccionado.
          </p>
        )}
      </div>
    </section>
  );
}
