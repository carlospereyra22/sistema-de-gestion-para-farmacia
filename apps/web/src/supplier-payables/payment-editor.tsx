import { useRef, useState } from "react";
import { CheckCircle2, WalletCards } from "lucide-react";
import {
  ars,
  dateLabel,
  inputMinor,
  payableRequest,
  PayableError,
  paymentMethods,
  purchaseAmountInput,
  type Invoice,
  type PayableScope,
  type SupplierPaymentInput,
} from "./api";
import { field, primary, secondary, PayableDialog } from "./dialog";

export function PaymentEditor({
  invoice,
  scope,
  today,
  storageKey,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  scope: PayableScope;
  today: string;
  storageKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [locked, setLocked] = useState<SupplierPaymentInput | undefined>(() => {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    try {
      return JSON.parse(raw) as SupplierPaymentInput;
    } catch {
      return;
    }
  });
  const [amount, setAmount] = useState(
      locked
        ? purchaseAmountInput(locked.amountMinor)
        : purchaseAmountInput(invoice.balanceMinor),
    ),
    [paidOn, setPaidOn] = useState(locked?.paidOn ?? today),
    [method, setMethod] = useState(locked?.method ?? ""),
    [reference, setReference] = useState(locked?.reference ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const gate = useRef(false);
  let entered = 0n;
  try {
    entered = BigInt(inputMinor(amount));
  } catch {
    /* Input still incomplete. */
  }
  const balance = BigInt(invoice.balanceMinor),
    remaining = balance - entered;
  let unassigned = entered;
  const allocations = [...invoice.dues]
    .sort(
      (a, b) =>
        (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") ||
        a.sequence - b.sequence,
    )
    .flatMap((d) => {
      const available = BigInt(d.balanceMinor),
        applied = unassigned < available ? unassigned : available;
      if (applied <= 0n) return [];
      unassigned -= applied;
      return [{ date: d.dueOn, amount: applied }];
    });
  const submit = async () => {
    if (gate.current) return;
    try {
      if (!method)
        throw new Error("Elegí el medio con el que realizaste el pago.");
      if (!locked && (entered <= 0n || entered > balance))
        throw new Error("El importe debe ser positivo y no superar el saldo.");
      if (!paidOn || paidOn < invoice.issuedOn || paidOn > today)
        throw new Error("Revisá la fecha del pago.");
      const body = locked ?? {
        operationId: crypto.randomUUID(),
        amountMinor: inputMinor(amount),
        expectedBalanceMinor: invoice.balanceMinor,
        paidOn,
        method,
        reference,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(body));
      setLocked(body);
      gate.current = true;
      setBusy(true);
      setError("");
      await payableRequest(scope, `/${invoice.id}/payments`, body);
      sessionStorage.removeItem(storageKey);
      onSaved();
    } catch (e) {
      if (
        e instanceof PayableError &&
        ([400, 403, 404].includes(e.status) || e.code === "BALANCE_CHANGED")
      ) {
        sessionStorage.removeItem(storageKey);
        setLocked(undefined);
      }
      setError(
        e instanceof Error ? e.message : "No se pudo registrar el pago.",
      );
    } finally {
      gate.current = false;
      setBusy(false);
    }
  };
  return (
    <PayableDialog
      title="Registrar pago"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
        <div>
          <p className="text-sm font-semibold">{invoice.supplierName}</p>
          <p className="mt-1 text-xs text-slate-500">
            {invoice.reference ||
              invoice.documentNumber ||
              "Deuda sin comprobante"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Saldo pendiente</p>
          <strong className="text-lg text-teal-700">
            {ars(invoice.balanceMinor)}
          </strong>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {locked && (
        <p className="mb-3 text-xs text-amber-700">
          Solicitud conservada. Reintentá los mismos datos para verificar el
          resultado sin duplicar el pago.
        </p>
      )}
      <fieldset
        disabled={busy || Boolean(locked)}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="text-xs text-slate-500">
          Importe pagado (ARS)
          <input
            autoFocus
            className={`${field} mt-1 font-semibold text-teal-800`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          Fecha del pago
          <input
            className={`${field} mt-1`}
            type="date"
            min={invoice.issuedOn}
            max={today}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          Medio de pago
          <select
            className={`${field} mt-1`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {Object.entries(paymentMethods).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Referencia (opcional)
          <input
            className={`${field} mt-1`}
            maxLength={160}
            placeholder="Nº de transferencia, recibo…"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
      </fieldset>
      {entered > 0n && remaining >= 0n && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">
          <CheckCircle2 size={17} />
          {remaining === 0n
            ? "La deuda quedará pagada."
            : `Quedará pendiente ${ars(remaining.toString())}.`}
        </div>
      )}
      {invoice.dues.length > 1 && (
        <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer">
            Aplicación a vencimientos · Primero los más antiguos
          </summary>
          <div className="mt-2 space-y-1">
            {allocations.map((a, i) => (
              <p key={i} className="flex justify-between">
                <span>{dateLabel(a.date)}</span>
                <span>{ars(a.amount.toString())}</span>
              </p>
            ))}
          </div>
        </details>
      )}
      <footer className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-3 text-xs text-slate-500">
          Confirmás un pago ya realizado. No envía dinero ni modifica Caja.
        </p>
        <div className="flex justify-end gap-2">
          <button className={secondary} disabled={busy} onClick={onClose}>
            {locked ? "Cerrar y conservar solicitud" : "Cancelar"}
          </button>
          <button
            className={primary}
            disabled={busy}
            onClick={() => void submit()}
          >
            <WalletCards size={16} />
            {busy
              ? "Registrando…"
              : locked
                ? "Reintentar pago"
                : "Confirmar pago"}
          </button>
        </div>
      </footer>
    </PayableDialog>
  );
}
