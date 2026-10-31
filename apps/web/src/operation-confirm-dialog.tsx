import { useRef, useState } from "react";
import { PayableDialog, field, secondary } from "./supplier-payables/dialog";

export function OperationConfirmDialog({
  title,
  description,
  requireReason = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <PayableDialog
      title={title}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <p className="text-sm leading-6 text-slate-600">{description}</p>
      {requireReason && (
        <label className="mt-4 block text-sm">
          Motivo
          <input
            className={`${field} mt-2`}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Por ejemplo: el proveedor no realizará la entrega"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <footer className="mt-6 flex justify-end gap-2">
        <button className={secondary} disabled={busy} onClick={onClose}>
          Volver
        </button>
        <button
          className={`${secondary} border-rose-200 text-rose-700 hover:bg-rose-50`}
          disabled={busy || (requireReason && reason.trim().length < 3)}
          onClick={async () => {
            if (pending.current) return;
            pending.current = true;
            setBusy(true);
            setError("");
            try {
              await onConfirm(reason.trim());
              onClose();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "No se pudo completar la operación.",
              );
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          {busy ? "Guardando…" : title}
        </button>
      </footer>
    </PayableDialog>
  );
}
