import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Filter,
  FlaskConical,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  StatusLabel,
} from "./data-table";
import {
  getPlatformOrganizations,
  type PlatformOrganization,
  type PlatformOrganizationCreated,
} from "./lib/platform-api";
import {
  coveredUntilLabel,
  filterOrganizations,
  stageFilterOptions,
  stageLabel,
  stageTone,
  summarizeOrganizations,
} from "./lib/platform-subscription";
import { usePage } from "./lib/use-page";
import { usePlatformData } from "./lib/use-platform-data";
import { Pagination } from "./pagination";
import { PlatformCredentialsDialog } from "./platform-credentials-dialog";
import { EstadoDeFarmacias } from "./platform-graficos";
import { PlatformOrganizationDetail } from "./platform-organization-detail";
import { PlatformOrganizationDialog } from "./platform-organization-dialog";
import {
  PlatformError,
  PlatformKpi,
  PlatformKpis,
  PlatformLoading,
  PlatformPageHeader,
  PlatformUsage,
} from "./platform-ui";
import { ProductFilterSelect } from "./product-filter-select";
import { ars, dateLabel } from "./supplier-payables/api";
import { primary } from "./supplier-payables/dialog";

const PAGE_SIZE = 10;

export function PlatformOrganizationsTable({
  rows,
  onOpen,
}: {
  rows: readonly PlatformOrganization[];
  onOpen: (id: string) => void;
}) {
  const { current, totalPages, setPage, visible } = usePage(rows, PAGE_SIZE);
  return (
    <DataTable
      label="Farmacias"
      minWidthClass="min-w-260"
      columns={[
        { label: "Farmacia" },
        { label: "Estado" },
        { label: "Cubierta hasta" },
        { label: "Usuarios", align: "right" },
        { label: "Sucursales", align: "right" },
        { label: "Abono", align: "right" },
        { label: "Saldo", align: "right" },
      ]}
      footer={
        rows.length > PAGE_SIZE ? (
          <Pagination
            integrated
            total={rows.length}
            currentPage={current}
            totalPages={totalPages}
            noun="farmacias"
            label="Páginas de farmacias"
            onChange={setPage}
          />
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <DataTableEmpty colSpan={7}>
          No hay farmacias para esta búsqueda.
        </DataTableEmpty>
      ) : (
        visible.map((row) => (
          <DataTableRow key={row.id} onToggle={() => onOpen(row.id)}>
            <DataTableCell>
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef6f4] text-[#087f70]"
                >
                  <Building2 size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900">
                    {row.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    Desde el {dateLabel(row.createdAt.slice(0, 10))}
                  </span>
                </span>
              </span>
            </DataTableCell>
            <DataTableCell>
              {row.subscription ? (
                <StatusLabel tone={stageTone(row.subscription.stage)}>
                  {stageLabel(row.subscription.stage)}
                </StatusLabel>
              ) : (
                "Sin plan"
              )}
            </DataTableCell>
            <DataTableCell>
              {row.subscription ? coveredUntilLabel(row.subscription) : "—"}
            </DataTableCell>
            <DataTableCell align="right" numeric>
              {row.subscription ? (
                <PlatformUsage
                  used={row.activeUsers}
                  quota={row.subscription.quota.users}
                  exempt={row.subscription.exempt}
                />
              ) : (
                row.activeUsers
              )}
            </DataTableCell>
            <DataTableCell align="right" numeric>
              {row.subscription ? (
                <PlatformUsage
                  used={row.activeBranches}
                  quota={row.subscription.quota.branches}
                  exempt={row.subscription.exempt}
                />
              ) : (
                row.activeBranches
              )}
            </DataTableCell>
            <DataTableCell align="right" numeric>
              {row.subscription ? ars(row.subscription.feeMinor) : "—"}
            </DataTableCell>
            <DataTableCell align="right" numeric>
              {BigInt(row.balanceMinor) > 0n ? ars(row.balanceMinor) : "—"}
            </DataTableCell>
          </DataTableRow>
        ))
      )}
    </DataTable>
  );
}

export function PlatformOrganizations({
  token,
  onVerificationExpired,
}: {
  token: string;
  onVerificationExpired: () => void;
}) {
  const load = useCallback(() => getPlatformOrganizations(token), [token]);
  const { data, error, reload } = usePlatformData(load, onVerificationExpired);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("ALL");
  const [opened, setOpened] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<PlatformOrganizationCreated>();
  const rows = useMemo(
    () => filterOrganizations(data ?? [], search, stage),
    [data, search, stage],
  );
  const summary = summarizeOrganizations(data ?? []);

  if (opened)
    return (
      <PlatformOrganizationDetail
        key={opened}
        token={token}
        organizationId={opened}
        onVerificationExpired={onVerificationExpired}
        onBack={() => {
          setOpened(undefined);
          reload();
        }}
      />
    );
  return (
    <div className="space-y-5">
      <PlatformPageHeader
        icon={<Building2 size={22} />}
        title="Farmacias"
        description="Clientes de la plataforma: estado del abono, cupos y saldo. Tocá una farmacia para ver su detalle."
        actions={
          <button
            type="button"
            className={primary}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
            Nueva farmacia
          </button>
        }
      />
      <PlatformKpis>
        <PlatformKpi
          icon={<Building2 size={18} />}
          label="Farmacias"
          value={String(summary.total)}
          hint="Todas las cuentas"
        />
        <PlatformKpi
          icon={<FlaskConical size={18} />}
          tone="sky"
          label="En prueba"
          value={String(summary.trial)}
          hint="Período de prueba vigente"
        />
        <PlatformKpi
          icon={<AlertTriangle size={18} />}
          tone={summary.late > 0 ? "amber" : "slate"}
          label="Con atraso"
          value={String(summary.late)}
          hint="En gracia, solo lectura o bloqueadas"
        />
        <PlatformKpi
          icon={<Wallet size={18} />}
          label="Abono mensual"
          value={ars(summary.monthlyMinor)}
          hint="Suma de abonos vigentes"
        />
      </PlatformKpis>
      {data && data.length > 0 && <EstadoDeFarmacias farmacias={data} />}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px]">
        <label className="relative block">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute inset-y-0 left-3 my-auto text-slate-400"
          />
          <input
            type="search"
            aria-label="Buscar farmacia"
            placeholder="Buscar farmacia"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 w-full rounded-xl border border-[#dce7ef] bg-white pl-9 pr-3 text-sm shadow-[0_3px_12px_rgb(25_56_74_/_3%)] outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-50"
          />
        </label>
        <ProductFilterSelect
          label="Estado"
          value={stage}
          options={stageFilterOptions}
          icon={<Filter size={16} />}
          onChange={setStage}
        />
      </div>
      {error ? (
        <PlatformError>{error}</PlatformError>
      ) : data ? (
        <PlatformOrganizationsTable rows={rows} onOpen={setOpened} />
      ) : (
        <PlatformLoading>Cargando farmacias…</PlatformLoading>
      )}
      {creating && (
        <PlatformOrganizationDialog
          token={token}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCreated(result);
            reload();
          }}
        />
      )}
      {created && (
        <PlatformCredentialsDialog
          title={`${created.name} creada`}
          email={created.email}
          password={created.temporaryPassword}
          onClose={() => setCreated(undefined)}
        />
      )}
    </div>
  );
}
