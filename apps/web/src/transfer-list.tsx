import {
  ArrowLeftRight,
  CircleCheck,
  Clock3,
  Package,
  Truck,
} from "lucide-react";
import type { BranchListItem, CatalogProduct, Transfer } from "./lib/api";

const statusStyle = {
  PREPARED: {
    label: "Preparada",
    icon: Package,
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
    iconColor: "bg-amber-50 text-amber-700",
  },
  IN_TRANSIT: {
    label: "En tránsito",
    icon: Truck,
    badge: "bg-sky-50 text-sky-700 ring-sky-200",
    iconColor: "bg-sky-50 text-sky-700",
  },
  RECEIVED: {
    label: "Recibida",
    icon: CircleCheck,
    badge: "bg-teal-50 text-teal-700 ring-teal-200",
    iconColor: "bg-teal-50 text-teal-700",
  },
  CANCELLED: {
    label: "Cancelada",
    icon: Clock3,
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    iconColor: "bg-slate-100 text-slate-600",
  },
} as const;

export function TransferList({
  transfers,
  branchId,
  branches,
  products,
  busyId,
  onAdvance,
}: {
  transfers: Transfer[];
  branchId: string;
  branches: BranchListItem[];
  products: CatalogProduct[];
  busyId: string | null;
  onAdvance: (transfer: Transfer) => void;
}) {
  const branchNames = new Map(
    branches.map((branch) => [branch.id, branch.name]),
  );
  const productNames = new Map(
    products.map((product) => [product.id, product.name]),
  );

  return (
    <section className="flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:min-h-[430px]">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            Transferencias
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Envíos y recepciones de esta sucursal
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600">
          {transfers.length}
        </span>
      </header>
      {transfers.length ? (
        <div className="divide-y divide-slate-100">
          {transfers.map((transfer) => {
            const status = statusStyle[transfer.status];
            const StatusIcon = status.icon;
            const action =
              transfer.status === "PREPARED" &&
              transfer.sourceBranchId === branchId
                ? "Despachar"
                : transfer.status === "IN_TRANSIT" &&
                    transfer.destinationBranchId === branchId
                  ? "Recibir"
                  : null;
            const totalUnits = transfer.items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            );
            return (
              <article key={transfer.id} className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl ${status.iconColor}`}
                    >
                      <StatusIcon size={19} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${status.badge}`}
                        >
                          {status.label}
                        </span>
                        <time
                          dateTime={transfer.createdAt}
                          className="text-xs text-slate-500"
                        >
                          {new Date(transfer.createdAt).toLocaleDateString(
                            "es-AR",
                          )}
                        </time>
                      </div>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                        <span>
                          {branchNames.get(transfer.sourceBranchId) ?? "Origen"}
                        </span>
                        <ArrowLeftRight
                          size={15}
                          aria-hidden
                          className="text-teal-600"
                        />
                        <span>
                          {branchNames.get(transfer.destinationBranchId) ??
                            "Destino"}
                        </span>
                      </p>
                    </div>
                  </div>
                  {action ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => onAdvance(transfer)}
                      className="h-9 rounded-lg border border-teal-200 bg-white px-3.5 text-sm font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-50"
                    >
                      {busyId === transfer.id ? "Procesando…" : action}
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <span>Productos</span>
                    <span className="normal-case tracking-normal">
                      {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-200">
                    {transfer.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                      >
                        <span className="min-w-0 break-words text-slate-700">
                          {productNames.get(item.productId) ??
                            "Producto del catálogo"}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                          {item.quantity} un.
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-teal-50 text-teal-700">
            <ArrowLeftRight size={22} aria-hidden />
          </span>
          <p className="mt-4 text-sm font-semibold text-slate-800">
            Aún no hay transferencias
          </p>
          <p className="mt-1 max-w-xs text-sm leading-5 text-slate-500">
            Prepará una transferencia para enviar productos a otra sucursal.
          </p>
        </div>
      )}
    </section>
  );
}
