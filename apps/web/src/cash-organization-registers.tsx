import { useEffect, useState, type ReactElement } from "react";
import { Filter, Store } from "lucide-react";
import {
  getCashOrganizationRegisters,
  type CashOrganizationOverview,
} from "./lib/api";
import {
  filterOrganizationRegisters,
  organizationRegisterState,
  type RegisterStateFilter,
} from "./lib/cash-organization-registers";
import { ProductFilterSelect } from "./product-filter-select";

/** Estado de las cajas de la organización, sin cambiar de sucursal. */
export function CashOrganizationRegisters({
  token,
  organizationId,
  refreshKey,
}: {
  token: string;
  organizationId: string;
  /** Al cambiar, vuelve a consultar. */
  refreshKey: unknown;
}): ReactElement {
  const [data, setData] = useState<CashOrganizationOverview>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [branchId, setBranchId] = useState("");
  const [state, setState] = useState<RegisterStateFilter>("");
  useEffect(() => {
    const controller = new AbortController();
    void getCashOrganizationRegisters(token, organizationId, controller.signal)
      .then((value) => {
        setData(value);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [token, organizationId, refreshKey, attempt]);
  return (
    <CashOrganizationTable
      data={data}
      failed={failed}
      branchId={branchId}
      state={state}
      onBranch={setBranchId}
      onState={setState}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}

export function CashOrganizationTable({
  data,
  failed,
  branchId,
  state,
  onBranch,
  onState,
  onRetry,
}: {
  data?: CashOrganizationOverview;
  failed: boolean;
  branchId: string;
  state: RegisterStateFilter;
  onBranch: (value: string) => void;
  onState: (value: RegisterStateFilter) => void;
  onRetry: () => void;
}): ReactElement {
  const rows = filterOrganizationRegisters(
    data?.registers ?? [],
    branchId,
    state,
  );
  return (
    <section className="cash-card">
      <h2 className="text-sm font-semibold">Cajas de la organización</h2>
      <p className="mt-1 text-xs text-slate-500">
        Estado actual de las cajas de tus sucursales.
      </p>
      <div className="cash-history-filters">
        <div className="text-xs text-slate-500">
          <span className="mb-1 block">Sucursal</span>
          <ProductFilterSelect
            compact
            label="Sucursal de la caja"
            icon={<Store size={15} aria-hidden />}
            value={branchId}
            options={[
              { value: "", label: "Todas las sucursales" },
              ...(data?.branches ?? []).map((branch) => ({
                value: branch.id,
                label: branch.name,
              })),
            ]}
            onChange={onBranch}
          />
        </div>
        <div className="text-xs text-slate-500">
          <span className="mb-1 block">Estado</span>
          <ProductFilterSelect
            compact
            label="Estado de la caja"
            icon={<Filter size={15} aria-hidden />}
            value={state}
            options={[
              { value: "", label: "Todas" },
              { value: "open", label: "Abiertas" },
              { value: "closed", label: "Cerradas" },
            ]}
            onChange={(value) => onState(value as RegisterStateFilter)}
          />
        </div>
      </div>
      {failed && (
        <p role="alert" className="mt-4 text-sm text-rose-600">
          No se pudieron consultar las cajas.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline"
          >
            Reintentar
          </button>
        </p>
      )}
      <div className="mt-5 overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-y text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-3">Caja</th>
                <th className="px-2 py-3">Sucursal</th>
                <th className="px-2 py-3">Estado</th>
                <th className="px-2 py-3">Abierta por</th>
                <th className="px-2 py-3">Desde</th>
                <th className="px-2 py-3">Responsable</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const label = organizationRegisterState(row);
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-medium">{row.name}</td>
                    <td className="px-2 py-3">{row.branchName}</td>
                    <td className="px-2 py-3">
                      <span
                        className={`cash-state ${row.session ? "is-open" : ""}`}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {row.session
                        ? (row.session.openedBy ?? "No registrado")
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {row.session
                        ? new Date(row.session.openedAt).toLocaleString(
                            "es-AR",
                            {
                              hourCycle: "h23",
                              dateStyle: "short",
                              timeStyle: "short",
                            },
                          )
                        : "—"}
                    </td>
                    <td className="px-2 py-3">{row.responsibleName || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          !failed && (
            <p className="py-10 text-center text-sm text-slate-400">
              {data ? "No hay cajas con estos filtros." : "Consultando cajas…"}
            </p>
          )
        )}
      </div>
    </section>
  );
}
