import { useRef, useState, type FormEvent } from "react";
import {
  Ban,
  CalendarClock,
  HandCoins,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { PlatformPanel } from "./platform-ui";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  RowIconAction,
  StatusLabel,
} from "./data-table";
import { formatAmountTyping } from "./lib/amount-typing";
import { lotCostInput, typedCostMinor } from "./lib/lot-cost";
import {
  extendPlatformSubscription,
  registerPlatformPayment,
  voidPlatformPayment,
  waivePlatformCharge,
  type PlatformBilling,
  type PlatformCharge,
  type PlatformPayment,
  type PlatformPaymentInput,
  type PlatformSubscription,
} from "./lib/platform-api";
import {
  balanceAfterPayment,
  balanceLabel,
  chargeStatus,
  paymentOutcomeUnknown,
} from "./lib/platform-billing";
import { usePage } from "./lib/use-page";
import { MoneyInput } from "./money-input";
import { OperationConfirmDialog } from "./operation-confirm-dialog";
import { Pagination } from "./pagination";
import { PlatformMoneyConfirm } from "./platform-money-confirm";
import { ars, dateLabel, paymentMethods } from "./supplier-payables/api";
import {
  PayableDialog,
  field,
  primary,
  secondary,
} from "./supplier-payables/dialog";

const PAGE_SIZE = 5;

type Organization = {
  id: string;
  name: string;
  billing: PlatformBilling;
  subscription: PlatformSubscription;
};

const methodOptions = Object.entries(paymentMethods).map(([value, label]) => ({
  value,
  label,
}));

const pendingKey = (organizationId: string) =>
  `plataforma-pago:${organizationId}`;

function readPending(key: string): PlatformPaymentInput | undefined {
  const raw = sessionStorage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PlatformPaymentInput;
  } catch {
    return undefined;
  }
}

function PaymentDialog({
  token,
  organization,
  onClose,
  onSaved,
}: {
  token: string;
  organization: Organization;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { billing } = organization;
  const key = pendingKey(organization.id);
  const [locked, setLocked] = useState(() => readPending(key));
  const [amount, setAmount] = useState(() => {
    const minor = locked?.amountMinor ?? billing.balanceMinor;
    return minor === "0" ? "" : formatAmountTyping(lotCostInput(minor));
  });
  const [paidOn, setPaidOn] = useState(locked?.paidOn ?? billing.today);
  const [method, setMethod] = useState(locked?.method ?? "TRANSFER");
  const [reference, setReference] = useState(locked?.reference ?? "");
  const [reviewed, setReviewed] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const gate = useRef(false);

  const send = async (body: PlatformPaymentInput) => {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    sessionStorage.setItem(key, JSON.stringify(body));
    setLocked(body);
    try {
      await registerPlatformPayment(token, organization.id, body);
      sessionStorage.removeItem(key);
      onSaved();
    } catch (cause) {
      if (!paymentOutcomeUnknown(cause)) {
        sessionStorage.removeItem(key);
        setLocked(undefined);
      }
      setReviewed(undefined);
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo registrar el pago.",
      );
    } finally {
      gate.current = false;
      setBusy(false);
    }
  };

  const review = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    // Un reintento repite lo ya confirmado: solo el primer intento pregunta.
    if (locked) {
      void send(locked);
      return;
    }
    if (!paidOn || paidOn > billing.today) {
      setError("Revisá la fecha del pago.");
      return;
    }
    try {
      const minor = typedCostMinor(amount);
      if (BigInt(minor) > 0n) setReviewed(minor);
      else setError("Ingresá un importe mayor a cero.");
    } catch {
      setError("Revisá el importe.");
    }
  };

  return (
    <PayableDialog
      title={`Registrar pago de ${organization.name}`}
      confirmationLabel="Confirmar pago"
      onClose={() => {
        if (busy) return;
        if (reviewed) setReviewed(undefined);
        else onClose();
      }}
      confirmation={
        reviewed && (
          <PlatformMoneyConfirm
            question="¿Registrás este pago?"
            rows={[
              ["Farmacia", organization.name],
              ["Importe", ars(reviewed)],
              ["Fecha", dateLabel(paidOn)],
              ["Medio", paymentMethods[method] ?? method],
              ...(reference.trim()
                ? ([["Referencia", reference.trim()]] as const)
                : []),
              ["Después del pago", balanceAfterPayment(billing, reviewed)],
            ]}
            busy={busy}
            onBack={() => setReviewed(undefined)}
            onConfirm={() =>
              void send({
                operationId: crypto.randomUUID(),
                amountMinor: reviewed,
                paidOn,
                method,
                reference,
              })
            }
          />
        )
      }
    >
      <form onSubmit={review}>
        <p className="mb-4 text-sm text-slate-600">
          {balanceLabel(billing)}. Se imputa primero a lo más viejo; si sobra,
          queda a favor para el mes siguiente.
        </p>
        {locked && (
          <p className="mb-3 text-sm text-amber-700">
            Solicitud conservada. Reintentá los mismos datos para verificar el
            resultado sin duplicar el pago.
          </p>
        )}
        <fieldset
          disabled={busy || Boolean(locked)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <MoneyInput
            label="Importe"
            labelClassName="block text-sm"
            value={amount}
            onChange={setAmount}
          />
          <label className="block text-sm">
            Fecha del pago
            <input
              required
              type="date"
              max={billing.today}
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <div className="text-sm sm:col-span-2">
            <p id="medio-de-pago" className="mb-1">
              Medio de pago
            </p>
            {/* Cuatro opciones: botones de un toque en vez de una lista
                desplegable, que dentro del diálogo quedaba tapada o cortada. */}
            <div
              role="radiogroup"
              aria-labelledby="medio-de-pago"
              className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:grid-cols-4"
            >
              {methodOptions.map(({ value, label }) => {
                const elegido = method === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={elegido}
                    disabled={busy || Boolean(locked)}
                    onClick={() => setMethod(value)}
                    className={`h-9 rounded-lg px-2 text-sm font-medium transition-colors disabled:opacity-60 ${elegido ? "bg-white text-[#087f70] shadow-sm ring-1 ring-[#cce8de]" : "text-slate-600 hover:bg-white/70 hover:text-slate-800"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block text-sm sm:col-span-2">
            Referencia (opcional)
            <input
              maxLength={160}
              placeholder="Nº de transferencia, de factura…"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            className={secondary}
            onClick={onClose}
          >
            {locked ? "Cerrar y conservar solicitud" : "Cancelar"}
          </button>
          <button disabled={busy} className={primary}>
            {busy
              ? "Registrando…"
              : locked
                ? "Reintentar pago"
                : "Registrar pago"}
          </button>
        </div>
      </form>
    </PayableDialog>
  );
}

function ExtensionDialog({
  token,
  organization,
  onClose,
  onSaved,
}: {
  token: string;
  organization: Organization;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { today } = organization.billing;
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const review = (event: FormEvent) => {
    event.preventDefault();
    if (!until || until < today) setError("Elegí una fecha desde hoy.");
    else if (reason.trim().length < 3) setError("Contá el motivo.");
    else {
      setError("");
      setConfirming(true);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await extendPlatformSubscription(token, organization.id, {
        until,
        reason,
      });
      onSaved();
    } catch (cause) {
      setConfirming(false);
      setError(
        cause instanceof Error ? cause.message : "No se pudo dar la prórroga.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <PayableDialog
      title={`Dar prórroga a ${organization.name}`}
      confirmationLabel="Confirmar prórroga"
      onClose={() => {
        if (busy) return;
        if (confirming) setConfirming(false);
        else onClose();
      }}
      confirmation={
        confirming && (
          <PlatformMoneyConfirm
            question="¿Das esta prórroga?"
            rows={[
              ["Farmacia", organization.name],
              ["Hasta", dateLabel(until)],
              ["Motivo", reason.trim()],
            ]}
            busy={busy}
            onBack={() => setConfirming(false)}
            onConfirm={() => void save()}
          />
        )
      }
    >
      <form onSubmit={review}>
        <p className="mb-4 text-sm text-slate-600">
          Mientras dure, la farmacia no se corta. La deuda no se perdona: los
          cargos se siguen generando.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Hasta
            <input
              required
              type="date"
              min={today}
              value={until}
              disabled={busy}
              onChange={(event) => setUntil(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-sm">
            Motivo
            <input
              required
              minLength={3}
              maxLength={300}
              placeholder="Por ejemplo: paga en cuotas"
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            className={secondary}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button disabled={busy} className={primary}>
            Dar prórroga
          </button>
        </div>
      </form>
    </PayableDialog>
  );
}

function ChargesTable({
  charges,
  onWaive,
}: {
  charges: readonly PlatformCharge[];
  onWaive: (charge: PlatformCharge) => void;
}) {
  const { current, totalPages, setPage, visible } = usePage(charges, PAGE_SIZE);
  return (
    <DataTable
      label="Cargos de la farmacia"
      minWidthClass="min-w-140"
      columns={[
        { label: "Período" },
        { label: "Importe", align: "right" },
        { label: "Saldo", align: "right" },
        { label: "Estado" },
        { label: "", align: "right" },
      ]}
      footer={
        charges.length > PAGE_SIZE ? (
          <Pagination
            integrated
            total={charges.length}
            currentPage={current}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            noun="cargos"
            label="Páginas de cargos"
            onChange={setPage}
          />
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <DataTableEmpty colSpan={5}>Todavía no tiene cargos.</DataTableEmpty>
      ) : (
        visible.map((charge) => {
          const status = chargeStatus(charge);
          return (
            <DataTableRow key={charge.id}>
              <DataTableCell>
                {dateLabel(charge.periodStart)}
                <span className="block text-xs text-slate-500">
                  al {dateLabel(charge.periodEnd)}
                </span>
              </DataTableCell>
              <DataTableCell align="right" numeric>
                {ars(charge.amountMinor)}
              </DataTableCell>
              <DataTableCell align="right" numeric>
                {ars(charge.balanceMinor)}
              </DataTableCell>
              <DataTableCell>
                <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
                {charge.waiveReason && (
                  <span className="block text-xs text-slate-500">
                    {charge.waiveReason}
                  </span>
                )}
              </DataTableCell>
              <DataTableCell align="right">
                {BigInt(charge.balanceMinor) > 0n && (
                  <RowIconAction
                    tone="neutral"
                    title="Condonar"
                    label={`Condonar el cargo del ${dateLabel(charge.periodStart)}`}
                    onClick={() => onWaive(charge)}
                  >
                    <HandCoins size={16} />
                  </RowIconAction>
                )}
              </DataTableCell>
            </DataTableRow>
          );
        })
      )}
    </DataTable>
  );
}

function PaymentsTable({
  payments,
  onVoid,
}: {
  payments: readonly PlatformPayment[];
  onVoid: (payment: PlatformPayment) => void;
}) {
  const { current, totalPages, setPage, visible } = usePage(
    payments,
    PAGE_SIZE,
  );
  return (
    <DataTable
      label="Pagos de la farmacia"
      minWidthClass="min-w-140"
      columns={[
        { label: "Fecha" },
        { label: "Medio" },
        { label: "Importe", align: "right" },
        { label: "Estado" },
        { label: "", align: "right" },
      ]}
      footer={
        payments.length > PAGE_SIZE ? (
          <Pagination
            integrated
            total={payments.length}
            currentPage={current}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            noun="pagos"
            label="Páginas de pagos"
            onChange={setPage}
          />
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <DataTableEmpty colSpan={5}>Todavía no registró pagos.</DataTableEmpty>
      ) : (
        visible.map((payment) => (
          <DataTableRow key={payment.id}>
            <DataTableCell>{dateLabel(payment.paidOn)}</DataTableCell>
            <DataTableCell>
              {paymentMethods[payment.method] ?? payment.method}
              {payment.reference && (
                <span className="block text-xs text-slate-500">
                  {payment.reference}
                </span>
              )}
            </DataTableCell>
            <DataTableCell align="right" numeric>
              {ars(payment.amountMinor)}
            </DataTableCell>
            <DataTableCell>
              <StatusLabel tone={payment.voided ? "muted" : "ok"}>
                {payment.voided ? "Anulado" : "Vigente"}
              </StatusLabel>
              {payment.voidReason && (
                <span className="block text-xs text-slate-500">
                  {payment.voidReason}
                </span>
              )}
            </DataTableCell>
            <DataTableCell align="right">
              {!payment.voided && (
                <RowIconAction
                  tone="danger"
                  title="Anular"
                  label={`Anular el pago del ${dateLabel(payment.paidOn)}`}
                  onClick={() => onVoid(payment)}
                >
                  <Ban size={16} />
                </RowIconAction>
              )}
            </DataTableCell>
          </DataTableRow>
        ))
      )}
    </DataTable>
  );
}

/** Cuánto debe, qué pagó y hasta cuándo se le dio plazo. */
export function PlatformBillingSection({
  token,
  organization,
  onChanged,
}: {
  token: string;
  organization: Organization;
  onChanged: (notice: string) => void;
}) {
  const { billing, subscription } = organization;
  const [paying, setPaying] = useState(false);
  const [extending, setExtending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [voiding, setVoiding] = useState<PlatformPayment>();
  const [waiving, setWaiving] = useState<PlatformCharge>();
  const extended = subscription.stage === "EXTENDED";
  return (
    <PlatformPanel
      icon={<ReceiptText size={16} />}
      title="Cuenta de la farmacia"
      description={balanceLabel(billing)}
      bodyClassName="space-y-3 p-3"
      actions={
        <>
          <button
            type="button"
            className={secondary}
            onClick={() => setExtending(true)}
          >
            <CalendarClock size={16} />
            {extended ? "Cambiar prórroga" : "Dar prórroga"}
          </button>
          <button
            type="button"
            className={primary}
            onClick={() => setPaying(true)}
          >
            <WalletCards size={16} />
            Registrar pago
          </button>
        </>
      }
    >
      {extended && subscription.extendedUntil && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <p className="min-w-0">
            Con prórroga hasta {dateLabel(subscription.extendedUntil)}
            {subscription.extendedReason && `: ${subscription.extendedReason}`}
          </p>
          <button
            type="button"
            className="shrink-0 font-medium underline"
            onClick={() => setRemoving(true)}
          >
            Quitar prórroga
          </button>
        </div>
      )}
      <div className="grid items-start gap-3 xl:grid-cols-2">
        <ChargesTable charges={billing.charges} onWaive={setWaiving} />
        <PaymentsTable payments={billing.payments} onVoid={setVoiding} />
      </div>
      {paying && (
        <PaymentDialog
          token={token}
          organization={organization}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            onChanged("Pago registrado.");
          }}
        />
      )}
      {extending && (
        <ExtensionDialog
          token={token}
          organization={organization}
          onClose={() => setExtending(false)}
          onSaved={() => {
            setExtending(false);
            onChanged("Prórroga guardada.");
          }}
        />
      )}
      {removing && (
        <OperationConfirmDialog
          requireReason
          title="Quitar prórroga"
          description="La farmacia vuelve a contar los días de atraso desde hoy, según lo que tenga pago."
          reasonPlaceholder="Por ejemplo: ya regularizó el pago"
          onClose={() => setRemoving(false)}
          onConfirm={async (reason) => {
            await extendPlatformSubscription(token, organization.id, {
              until: null,
              reason,
            });
            onChanged("Prórroga quitada.");
          }}
        />
      )}
      {voiding && (
        <OperationConfirmDialog
          requireReason
          title="Anular pago"
          description={`El pago de ${ars(voiding.amountMinor)} del ${dateLabel(voiding.paidOn)} deja de contar y la cobertura se recalcula. El registro se conserva.`}
          reasonPlaceholder="Por ejemplo: se cargó dos veces"
          onClose={() => setVoiding(undefined)}
          onConfirm={async (reason) => {
            await voidPlatformPayment(
              token,
              organization.id,
              voiding.id,
              reason,
            );
            onChanged("Pago anulado.");
          }}
        />
      )}
      {waiving && (
        <OperationConfirmDialog
          requireReason
          title="Condonar cargo"
          description={`Se perdona el saldo de ${ars(waiving.balanceMinor)} del período que empieza el ${dateLabel(waiving.periodStart)}. Lo que ya pagó de ese mes queda a favor.`}
          reasonPlaceholder="Por ejemplo: cortesía por un problema del sistema"
          onClose={() => setWaiving(undefined)}
          onConfirm={async (reason) => {
            await waivePlatformCharge(
              token,
              organization.id,
              waiving.id,
              reason,
            );
            onChanged("Cargo condonado.");
          }}
        />
      )}
    </PlatformPanel>
  );
}
