import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  Boxes,
  ContactRound,
  LayoutDashboard,
  Lock,
  Package,
  Percent,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  ALL_BRANCHES,
  type ReportFilterOptions,
  type ReportTab,
} from "@gestion/contracts";
import { getReportFilterOptions } from "./lib/reports-api";
import {
  argentineToday,
  defaultReportView,
  isTabAllowed,
  readReportView,
  reportTabs,
  restrictedTabs as restricted,
  resolveBranchId,
  writeReportView,
  type ReportView,
} from "./lib/report-view";
import { ReportFiltersBar } from "./report-filters-bar";
import { ReportLegacyOverview } from "./report-legacy-overview";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportSkeleton,
  reportCardClass,
} from "./report-states";

const tabIcons: Record<ReportTab, LucideIcon> = {
  summary: LayoutDashboard,
  sales: ShoppingCart,
  profitability: Percent,
  products: Package,
  inventory: Boxes,
  purchases: Truck,
  customers: ContactRound,
};

const upcoming: Partial<Record<ReportTab, string>> = {
  sales:
    "Ventas por día y por hora, mapa de calor, medios de pago y detalle por sucursal.",
  profitability:
    "Ganancia bruta estimada, margen, costo de ventas y productos más rentables.",
  products: "Más vendidos, productos sin movimiento y rotación contra margen.",
  inventory: "Valor del stock, stock bajo, sin stock y próximos vencimientos.",
  purchases:
    "Compras recibidas, facturas pendientes, recepciones pendientes y aumentos de costo.",
  customers:
    "Saldos de cuenta corriente, cobranzas, antigüedad de deuda y mayores deudores.",
};

/**
 * Modulo Reportes: pestanas, filtros globales y contenido de la pestana activa.
 * La vista vive en la URL (`?pagina=reportes&seccion=...`) para poder compartirla.
 */
export function ReportsWorkspace({
  token,
  organizationId,
  currentBranchId,
  search,
  onSearchChange,
}: {
  token: string;
  organizationId: string;
  /** Sucursal elegida en el encabezado; la vista anterior la usa con "Todas". */
  currentBranchId: string;
  search: URLSearchParams;
  onSearchChange: (next: URLSearchParams) => void;
}): ReactElement {
  const today = argentineToday();
  const view = readReportView(search, today);
  const [options, setOptions] = useState<ReportFilterOptions>();
  const [error, setError] = useState<string>();

  const loadOptions = useCallback(() => {
    let current = true;
    setError(undefined);
    getReportFilterOptions(token, organizationId)
      .then((next) => {
        if (current) setOptions(next);
      })
      .catch((cause: unknown) => {
        if (current)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar los reportes.",
          );
      });
    return () => {
      current = false;
    };
  }, [token, organizationId]);
  useEffect(loadOptions, [loadOptions]);

  const setView = (next: ReportView) =>
    onSearchChange(writeReportView(search, next));

  const branches = useMemo(() => options?.branches ?? [], [options]);
  const branchId = options
    ? resolveBranchId(view.branchId, branches)
    : view.branchId;

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label="Reportes"
        className="flex gap-1 overflow-x-auto rounded-xl border border-[#dce7ef] bg-white p-1"
      >
        {reportTabs.map((tab) => {
          const Icon = tabIcons[tab.id];
          const allowed = isTabAllowed(tab.id, options?.access);
          const active = view.tab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={allowed ? undefined : restricted[tab.id]?.text}
              onClick={() => setView({ ...view, tab: tab.id })}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                active
                  ? "bg-[#e8faf5] text-[#087f70] ring-1 ring-inset ring-[#cce8de]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon size={16} aria-hidden />
              {tab.label}
              {allowed ? null : (
                <Lock size={13} className="text-slate-400" aria-hidden />
              )}
            </button>
          );
        })}
      </nav>

      {error ? (
        <ReportErrorState message={error} onRetry={loadOptions} />
      ) : !options ? (
        <ReportSkeleton />
      ) : (
        <>
          <ReportFiltersBar
            view={{ ...view, branchId }}
            branches={branches}
            today={today}
            onChange={setView}
            onReset={() =>
              setView({ ...defaultReportView(today), tab: view.tab })
            }
          />
          <ReportTabContent
            tab={view.tab}
            options={options}
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            currentBranchId={currentBranchId}
            from={view.from}
            to={view.to}
          />
        </>
      )}
    </div>
  );
}

function ReportTabContent({
  tab,
  options,
  token,
  organizationId,
  branchId,
  currentBranchId,
  from,
  to,
}: {
  tab: ReportTab;
  options: ReportFilterOptions;
  token: string;
  organizationId: string;
  branchId: string;
  currentBranchId: string;
  from: string;
  to: string;
}): ReactElement {
  if (!options.branches.length)
    return (
      <div className={reportCardClass}>
        <ReportEmptyState
          title="No tenés sucursales asignadas"
          description="Pedile a un administrador que te asigne una sucursal para ver reportes."
        />
      </div>
    );
  if (!isTabAllowed(tab, options.access))
    return (
      <div className={reportCardClass}>
        <ReportEmptyState
          icon={<Lock size={20} aria-hidden />}
          title="No tenés acceso a esta pestaña"
          description={restricted[tab]?.text}
        />
      </div>
    );
  if (tab === "summary") {
    // La vista anterior consulta una sola sucursal: con "Todas" usa la del encabezado.
    const single =
      branchId === ALL_BRANCHES
        ? (options.branches.find((branch) => branch.id === currentBranchId) ??
          options.branches[0]!)
        : options.branches.find((branch) => branch.id === branchId)!;
    return (
      <ReportLegacyOverview
        token={token}
        organizationId={organizationId}
        branchId={single.id}
        from={from}
        to={to}
        notice={
          branchId === ALL_BRANCHES
            ? `Muestra solo la sucursal ${single.name}; el total de todas las sucursales llega con el Resumen nuevo.`
            : undefined
        }
      />
    );
  }
  return (
    <div className={reportCardClass}>
      <ReportEmptyState
        title="Pestaña en preparación"
        description={upcoming[tab]}
      />
    </div>
  );
}
