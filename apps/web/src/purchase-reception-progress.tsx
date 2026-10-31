import type { Purchase } from "./lib/api";
import { purchasePending } from "./lib/purchases";

export function PurchaseReceptionProgress({
  purchase,
}: {
  purchase: Purchase;
}) {
  const ordered = purchase.items.reduce(
    (sum, item) => sum + item.orderedQuantity,
    0,
  );
  const received = purchase.items.reduce(
    (sum, item) => sum + item.receivedQuantity,
    0,
  );
  const pending = purchase.items.reduce(
    (sum, item) => sum + purchasePending(item),
    0,
  );
  const cancelled = purchase.items.reduce(
    (sum, item) => sum + (item.cancelledQuantity ?? 0),
    0,
  );
  const closed = Boolean(purchase.closedAt) || purchase.status === "CANCELLED";
  const partial = received > 0 && pending > 0 && !closed;
  const percentage =
    ordered > 0 ? Math.min(100, Math.max(0, (received / ordered) * 100)) : 0;
  const number = (value: number) => value.toLocaleString("es-AR");
  return (
    <div className="min-w-40 max-w-52">
      <p className="whitespace-nowrap text-xs text-slate-600">
        <strong className={partial ? "text-amber-700" : "text-slate-800"}>
          {number(received)}
        </strong>
        {" / "}
        {number(ordered)} un. recibidas
      </p>
      <div
        role="progressbar"
        aria-label="Unidades recibidas de la compra"
        aria-valuemin={0}
        aria-valuemax={ordered || 1}
        aria-valuenow={Math.min(received, ordered)}
        className="my-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          style={{ width: `${percentage}%` }}
          className={`h-full rounded-full ${closed ? "bg-slate-400" : partial ? "bg-amber-400" : "bg-teal-500"}`}
        />
      </div>
      <p
        className={`text-[11px] ${partial ? "font-medium text-amber-700" : "text-slate-500"}`}
      >
        {closed
          ? cancelled > 0
            ? `${number(cancelled)} un. no entregadas · Saldo cerrado`
            : "Compra cerrada"
          : pending > 0
            ? `${number(pending)} un. pendientes`
            : "Sin unidades pendientes"}
      </p>
    </div>
  );
}
