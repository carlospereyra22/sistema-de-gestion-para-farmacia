import { useCallback, useMemo, useState } from "react";
import { Building2, Filter, Plus, Search } from "lucide-react";
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
  usageLabel,
} from "./lib/platform-subscription";
import { usePlatformData } from "./lib/use-platform-data";
import { Pagination } from "./pagination";
import { PlatformCredentialsDialog } from "./platform-credentials-dialog";
import { PlatformOrganizationDetail } from "./platform-organization-detail";
import { PlatformOrganizationDialog } from "./platform-organization-dialog";
import { ProductFilterSelect } from "./product-filter-select";
import { ars } from "./supplier-payables/api";
import { primary } from "./supplier-payables/dialog";

const PAGE_SIZE = 10;

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function PlatformOrganizationsTable({
  rows,
  onOpen,
}: {
  rows: readonly PlatformOrganization[];
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return (
    <DataTable
      label="Farmacias"
      minWidthClass="min-w-230"
      columns={[
        { label: "Farmacia" },
        { label: "Estado" },
        { label: "Cubierta hasta" },
        { label: "Usuarios", align: "right" },
        { label: "Sucursales", align: "right" },
        { label: "Abono", align: "right" },
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
        <DataTableEmpty colSpan={6}>
          No hay farmacias para esta búsqueda.
        </DataTableEmpty>
      ) : (
        visible.map((row) => (
          <DataTableRow key={row.id} onToggle={() => onOpen(row.id)}>
            <DataTableCell className="font-medium text-slate-900">
              {row.name}
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
              {row.subscription
                ? usageLabel(
                    row.activeUsers,
                    row.subscription.quota.users,
                    row.subscription.exempt,
                  )
                : row.activeUsers}
            </DataTableCell>
            <DataTableCell align="right" numeric>
              {row.subscription
                ? usageLabel(
                    row.activeBranches,
                    row.subscription.quota.branches,
                    row.subscription.exempt,
                  )
                : row.activeBranches}
            </DataTableCell>
            <DataTableCell align="right" numeric>
              {row.subscription ? ars(row.subscription.feeMinor) : "—"}
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
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Farmacias</h1>
        <button
          type="button"
          className={primary}
          onClick={() => setCreating(true)}
        >
          <Plus size={16} />
          Nueva farmacia
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Farmacias" value={String(summary.total)} />
        <Metric label="En prueba" value={String(summary.trial)} />
        <Metric label="Con atraso" value={String(summary.late)} />
        <Metric label="Abono mensual" value={ars(summary.monthlyMinor)} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px]">
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
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-500"
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
      <div className="mt-4">
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : data ? (
          <PlatformOrganizationsTable rows={rows} onOpen={setOpened} />
        ) : (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-slate-500"
          >
            <Building2 size={16} aria-hidden="true" />
            Cargando farmacias…
          </p>
        )}
      </div>
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
    </>
  );
}
