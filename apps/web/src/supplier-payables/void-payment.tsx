import { useRef, useState } from "react";
import { ars, payableRequest, type Invoice, type PayableScope } from "./api";
import { field, secondary, PayableDialog } from "./dialog";
export function VoidPayment({
  invoice,
  paymentId,
  scope,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  paymentId: string;
  scope: PayableScope;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const gate = useRef(false);
  const payment = invoice.payments.find((p) => p.id === paymentId)!;
  return (
    <PayableDialog
      title="Anular registro de pago"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="text-sm text-slate-600">
        Se volverán a dejar pendientes {ars(payment.amountMinor)} de{" "}
        {invoice.supplierName}. El pago seguirá visible como anulado.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Solo corrige el registro: no devuelve dinero ni modifica Caja.
      </p>
      <label className="mt-4 block text-xs text-slate-500">
        Motivo de la anulación
        <input
          autoFocus
          className={`${field} mt-1`}
          value={reason}
          maxLength={300}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <footer className="mt-5 flex justify-end gap-2">
        <button className={secondary} disabled={busy} onClick={onClose}>
          Volver
        </button>
        <button
          disabled={busy || reason.trim().length < 3}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={async () => {
            if (gate.current) return;
            gate.current = true;
            setBusy(true);
            try {
              await payableRequest(
                scope,
                `/${invoice.id}/payments/${paymentId}/void`,
                { reason },
              );
              onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo anular.");
            } finally {
              setBusy(false);
              gate.current = false;
            }
          }}
        >
          {busy ? "Anulando…" : "Confirmar anulación"}
        </button>
      </footer>
    </PayableDialog>
  );
}
