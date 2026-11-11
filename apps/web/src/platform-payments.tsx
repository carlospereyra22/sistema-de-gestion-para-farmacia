import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  HandCoins,
  PhoneCall,
  ReceiptText,
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
  getPlatformPayments,
  type PlatformOrganization,
  type PlatformRecentPayment,
} from "./lib/platform-api";
import { debtors, totalDebtMinor } from "./lib/platform-billing";
import {
  coveredUntilLabel,
  nextCutLabel,
  stageLabel,
  stageTone,
} from "./lib/platform-subscription";
import { usePage } from "./lib/use-page";
import { usePlatformData } from "./lib/use-platform-data";
import { Pagination } from "./pagination";
import { CobrosPorMes } from "./platform-graficos";
import { PlatformOrganizationDetail } from "./platform-organization-detail";
import {
  PlatformError,
  PlatformKpi,
  PlatformKpis,
  PlatformLoading,
  PlatformPageHeader,
  PlatformPanel,
} from "./platform-ui";
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
      minWidthClass="min-w-220"
      columns={[
        { label: "Farmacia" },
        { label: "Estado" },
        { label: "Cubierta hasta" },
        { label: "Próximo corte" },
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
        <DataTableEmpty colSpan={6}>Ninguna farmacia debe.</DataTableEmpty>
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
            <DataTableCell>
              {nextCutLabel(row.subscription?.nextCut ?? null)}
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
    <div className="space-y-5">
      <PlatformPageHeader
        icon={<Wallet size={22} />}
        title="Pagos"
        description="Quién debe y qué se cobró. Tocá una fila para registrar un pago o dar una prórroga."
      />
      <PlatformKpis columns={3}>
        <PlatformKpi
          icon={<AlertTriangle size={18} />}
          tone={owing.length > 0 ? "amber" : "slate"}
          label="Deuda total"
          value={ars(totalDebtMinor(owing))}
          hint="Saldo vencido de todas las farmacias"
        />
        <PlatformKpi
          icon={<Building2 size={18} />}
          tone={owing.length > 0 ? "rose" : "slate"}
          label="Farmacias con deuda"
          value={String(owing.length)}
          hint="Para llamar o avisar"
        />
        <PlatformKpi
          icon={<HandCoins size={18} />}
          label="Cobrado este mes"
          value={ars(data?.[1].collectedThisMonthMinor ?? "0")}
          hint="Pagos vigentes del mes"
        />
      </PlatformKpis>
      {error ? (
        <PlatformError>{error}</PlatformError>
      ) : data ? (
        <>
          <CobrosPorMes mensual={data[1].monthly ?? []} />
          <PlatformPanel
            icon={<PhoneCall size={16} />}
            title="Quién debe"
            description="Con el contacto para llamar."
            bodyClassName="p-3"
          >
            <PlatformDebtorsTable rows={owing} onOpen={setOpened} />
          </PlatformPanel>
          <PlatformPanel
            icon={<ReceiptText size={16} />}
            title="Últimos pagos"
            description="Los anulados quedan a la vista."
            bodyClassName="p-3"
          >
            <PlatformRecentPaymentsTable
              rows={data[1].payments}
              onOpen={setOpened}
            />
          </PlatformPanel>
        </>
      ) : (
        <PlatformLoading>Cargando pagos…</PlatformLoading>
      )}
    </div>
  );
}
