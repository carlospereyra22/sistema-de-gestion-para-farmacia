import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Filter,
  KeyRound,
  Landmark,
  LifeBuoy,
  ScrollText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
} from "./data-table";
import {
  getPlatformAudit,
  PlatformApiError,
  type PlatformAuditEntry,
} from "./lib/platform-api";
import {
  platformActionLabel,
  platformActorLabel,
  platformAuditDetail,
  platformAuditGroup,
  platformAuditGroups,
  platformDateLabel,
  type PlatformAuditGroup,
} from "./lib/platform-audit";
import {
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
} from "./platform-ui";
import { ProductFilterSelect } from "./product-filter-select";

const groupStyle: Record<PlatformAuditGroup, [LucideIcon, string]> = {
  soporte: [LifeBuoy, "bg-violet-50 text-violet-700"],
  cobros: [Wallet, "bg-marca-970 text-marca-535"],
  farmacias: [Building2, "bg-sky-50 text-sky-700"],
  accesos: [KeyRound, "bg-amber-50 text-amber-700"],
  arca: [Landmark, "bg-slate-100 text-slate-600"],
};
import { Pagination } from "./pagination";

const PAGE_SIZE = 10;

export function PlatformAuditTable({
  rows,
  emptyText = "Todavía no hay registros.",
}: {
  rows: PlatformAuditEntry[];
  emptyText?: string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return (
    <DataTable
      label="Auditoría de la plataforma"
      columns={[
        { label: "Fecha" },
        { label: "Acción" },
        { label: "Farmacia" },
        { label: "Quién" },
      ]}
      minWidthClass="min-w-180"
      footer={
        rows.length > PAGE_SIZE ? (
          <Pagination
            integrated
            total={rows.length}
            currentPage={current}
            totalPages={totalPages}
            noun="registros"
            label="Páginas de la auditoría"
            onChange={setPage}
          />
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <DataTableEmpty colSpan={4}>{emptyText}</DataTableEmpty>
      ) : (
        visible.map((row) => (
          <DataTableRow key={row.id}>
            <DataTableCell className="whitespace-nowrap">
              {platformDateLabel(row.createdAt)}
            </DataTableCell>
            <DataTableCell>
              <AuditAction row={row} />
            </DataTableCell>
            <DataTableCell>
              {row.organizationName ?? (
                <span className="text-slate-400">—</span>
              )}
            </DataTableCell>
            <DataTableCell className="text-slate-600">
              {platformActorLabel(row.actorEmail)}
            </DataTableCell>
          </DataTableRow>
        ))
      )}
    </DataTable>
  );
}

/** Ícono del tipo de registro. */
function AuditIcon({ action }: { action: string }) {
  const [Icon, tone] = groupStyle[platformAuditGroup(action)];
  return (
    <span
      aria-hidden="true"
      className={`grid size-7 shrink-0 place-items-center rounded-lg ${tone}`}
    >
      <Icon size={14} />
    </span>
  );
}

function AuditAction({ row }: { row: PlatformAuditEntry }) {
  const detail = platformAuditDetail(row);
  return (
    <span className="flex items-center gap-2.5">
      <AuditIcon action={row.action} />
      <span className="min-w-0">
        <span className="block font-medium text-slate-800">
          {platformActionLabel(row.action)}
        </span>
        {detail && (
          <span className="block truncate text-xs text-slate-500">
            {detail}
          </span>
        )}
      </span>
    </span>
  );
}

export function PlatformAuditPanel({
  token,
  onVerificationExpired,
}: {
  token: string;
  onVerificationExpired: () => void;
}) {
  const [rows, setRows] = useState<PlatformAuditEntry[]>();
  const [error, setError] = useState("");
  const [group, setGroup] = useState("ALL");
  const filtered = useMemo(
    () =>
      rows?.filter(
        ({ action }) => group === "ALL" || platformAuditGroup(action) === group,
      ),
    [rows, group],
  );
  useEffect(() => {
    let active = true;
    getPlatformAudit(token)
      .then((items) => {
        if (active) setRows(items);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (
          cause instanceof PlatformApiError &&
          cause.code === "PLATFORM_VERIFICATION_REQUIRED"
        )
          onVerificationExpired();
        else
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar la auditoría.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, onVerificationExpired]);
  return (
    <div className="space-y-5">
      <PlatformPageHeader
        icon={<ScrollText size={22} />}
        title="Auditoría"
        description="Las últimas 100 acciones hechas en la plataforma, incluidas las entradas de soporte. Las farmacias no ven estos registros."
        actions={
          <div className="w-64">
            <ProductFilterSelect
              label="Tipo de registro"
              value={group}
              options={platformAuditGroups}
              icon={<Filter size={16} />}
              onChange={setGroup}
              compact
            />
          </div>
        }
      />
      {error ? (
        <PlatformError>{error}</PlatformError>
      ) : filtered ? (
        <PlatformAuditTable
          key={group}
          rows={filtered}
          emptyText={
            group === "ALL"
              ? undefined
              : "No hay registros de este tipo entre los últimos 100."
          }
        />
      ) : (
        <PlatformLoading>Cargando auditoría…</PlatformLoading>
      )}
    </div>
  );
}
