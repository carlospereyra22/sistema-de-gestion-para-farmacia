import type { ReactElement } from "react";
import { CashDialog } from "./cash-dialog";
import type { CashPendingCollection } from "./lib/api";
import {
  pendingConfirmationCopy,
  type PendingCollectionAction,
} from "./lib/cash-pending-confirmation";

/** Popup que pide confirmar cada acción sobre un cobro pendiente. */
export function CashPendingConfirmation({
  action,
  registerName,
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  action: PendingCollectionAction;
  registerName: string;
  row: CashPendingCollection;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  const copy = pendingConfirmationCopy(action, registerName, row.cashMinor);
  return (
    <CashDialog title={copy.title} busy={busy} onClose={onCancel}>
      <p className="text-sm font-medium">{copy.question}</p>
      <p className="mt-2 text-sm text-slate-500">{copy.detail}</p>
      {action === "incorporate" && row.facturaEnEspera && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800"
        >
          Esta venta tiene una factura en espera de caja. Al incorporar el cobro
          se emite la factura C en ARCA, con la fecha de hoy.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {row.sourceType === "SALE" ? "Venta" : "Recibo"}{" "}
        {row.sourceId.slice(0, 8)} ·{" "}
        {new Date(row.collectedAt).toLocaleString("es-AR", {
          hourCycle: "h23",
        })}
        {row.collectedBy ? ` · ${row.collectedBy}` : ""}
      </p>
      <footer className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Guardando…" : copy.confirm}
        </button>
      </footer>
    </CashDialog>
  );
}
