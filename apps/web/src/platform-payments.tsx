import { useCallback, useMemo, useState } from "react";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  StatusLabel,
} from "./data-table";
import {
  getPlatformOrganizations,
  getPlatformPayments,
  type PlatformOrganization,
  type PlatformRecentPayment,
} from "./lib/platform-api";
import { debtors, totalDebtMinor } from "./lib/platform-billing";
import {
  coveredUntilLabel,
  stageLabel,
  stageTone,
} from "./lib/platform-subscription";
import { usePage } from "./lib/use-page";
import { usePlatformData } from "./lib/use-platform-data";
import { Pagination } from "./pagination";
import { PlatformOrganizationDetail } from "./platform-organization-detail";
import { Metric } from "./platform-organizations";
import { ars, dateLabel, paymentMethods } from "./supplier-payables/api";

const PAGE_SIZE = 10;

/** A quién hay que llamar: el teléfono primero, porque es lo que más se usa. */
const contactLabel = ({ subscription }: PlatformOrganization) =>
  subscription?.contactPhone ||
  subscription?.contactEmail ||
  subscription?.contactName ||
  "Sin contacto";

export function PlatformDebtorsTable({
  rows,
  onOpen,
}: {
  rows: readonly PlatformOrganization[];
  onOpen: (id: string) => void;
}) {
  const { current, totalPages, setPage, visible } = usePage(rows, PAGE_SIZE);
  return (
    <DataTable
      label="Farmacias con deuda"
      minWidthClass="min-w-190"
      columns={[
        { label: "Farmacia" },
        { label: "Estado" },
        { label: "Cubierta hasta" },
        { label: "Contacto" },
        { label: "Debe", align: "right" },
      ]}
      footer={
        rows.length > PAGE_SIZE ? (
          <Pagination
            integrated
            total={rows.length}
            currentPage={current}
            totalPages={totalPages}
            noun="farmacias"
            label="Páginas de farmacias con deuda"
            onChange={setPage}
          />
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <DataTableEmpty colSpan={5}>Ninguna farmacia debe.</DataTableEmpty>
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
            <DataTableCell>{contactLabel(row)}</DataTableCell>
            <DataTableCell align="right" numeric>
              {ars(row.balanceMinor)}
            </DataTableCell>
          </DataTableRow>
        ))
      )}
    </DataTable>
  );
}

export function PlatformRecentPaymentsTable({
  rows,
  onOpen,
}: {
  rows: readonly PlatformRecentPayment[];
  onOpen: (id: string) => void;
}) {
  const { current, totalPages, setPage, visible } = usePage(rows, PAGE_SIZE);
  return (
    <DataTable
      label="Últimos pagos"
      minWidthClass="min-w-190"
      columns={[
        { label: "Fecha" },
        { label: "Farmacia" },
        { label: "Medio" },
        { label: "Estado" },
        { label: "Importe", align: "right" },
      ]}
      footer={
        rows.length > PAGE_SIZE ? (
          <Pagination
            integrated
            total={rows.length}
            currentPage={current}
            totalPages={totalPages}
            noun="pagos"
            label="Páginas de últimos pagos"
            onChange={setPage}
          />
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <DataTableEmpty colSpan={5}>
          Todavía no se registraron pagos.
        </DataTableEmpty>
      ) : (
        visible.map((payment) => (
          <DataTableRow
            key={payment.id}
            onToggle={() => onOpen(payment.organizationId)}
          >
            <DataTableCell>{dateLabel(payment.paidOn)}</DataTableCell>
            <DataTableCell className="font-medium text-slate-900">
              {payment.organizationName}
            </DataTableCell>
            <DataTableCell>
              {paymentMethods[payment.method] ?? payment.method}
              {payment.reference && (
                <span className="block text-xs text-slate-500">
                  {payment.reference}
                </span>
              )}
            </DataTableCell>
            <DataTableCell>
              <StatusLabel tone={payment.voided ? "muted" : "ok"}>
                {payment.voided ? "Anulado" : "Vigente"}
              </StatusLabel>
            </DataTableCell>
            <DataTableCell align="right" numeric>
              {ars(payment.amountMinor)}
            </DataTableCell>
          </DataTableRow>
        ))
      )}
    </DataTable>
  );
}

export function PlatformPayments({
  token,
  onVerificationExpired,
}: {
  token: string;
  onVerificationExpired: () => void;
}) {
  const load = useCallback(
    () =>
      Promise.all([
        getPlatformOrganizations(token),
        getPlatformPayments(token),
      ]),
    [token],
  );
  const { data, error, reload } = usePlatformData(load, onVerificationExpired);
  const [opened, setOpened] = useState<string>();
  const owing = useMemo(() => debtors(data?.[0] ?? []), [data]);

  if (opened)
    return (
      <PlatformOrganizationDetail
        key={opened}
        token={token}
        organizationId={opened}
        backLabel="Volver a Pagos"
        onVerificationExpired={onVerificationExpired}
        onBack={() => {
          setOpened(undefined);
          reload();
        }}
      />
    );
  return (
    <>
      <h1 className="text-2xl font-semibold">Pagos</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Metric label="Deuda total" value={ars(totalDebtMinor(owing))} />
        <Metric label="Farmacias con deuda" value={String(owing.length)} />
        <Metric
          label="Cobrado este mes"
          value={ars(data?.[1].collectedThisMonthMinor ?? "0")}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : data ? (
        <>
          <h2 className="mb-3 mt-5 font-semibold">Quién debe</h2>
          <PlatformDebtorsTable rows={owing} onOpen={setOpened} />
          <h2 className="mb-3 mt-5 font-semibold">Últimos pagos</h2>
          <PlatformRecentPaymentsTable
            rows={data[1].payments}
            onOpen={setOpened}
          />
        </>
      ) : (
        <p role="status" className="mt-4 text-sm text-slate-500">
          Cargando pagos…
        </p>
      )}
    </>
  );
}
