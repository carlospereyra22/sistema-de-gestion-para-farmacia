import {
  ArrowLeftRight,
  ChevronDown,
  CircleCheck,
  Clock3,
  Package,
  Truck,
} from "lucide-react";
import { useRef, useState } from "react";
import type { BranchListItem, CatalogProduct, Transfer } from "./lib/api";
import { usePage } from "./lib/use-page";
import { Pagination } from "./pagination";

/** Transferencias por página: cada una es una fila compacta. */
export const TRANSFERENCIAS_POR_PAGINA = 8;

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
  const { current, totalPages, setPage, visible } = usePage(
    transfers,
    TRANSFERENCIAS_POR_PAGINA,
  );
  const lista = useRef<HTMLElement>(null);
  // Productos desplegados (por transferencia): plegados para que la lista
  // sea corta y el paginador quede a la vista.
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const alternar = (id: string) =>
    setAbiertas((actuales) =>
      actuales.includes(id)
        ? actuales.filter((actual) => actual !== id)
        : [...actuales, id],
    );
  const cambiarPagina = (pagina: number) => {
    setPage(pagina);
    // Al pasar de página se vuelve al comienzo de la lista.
    lista.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <section
      ref={lista}
      className="flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:min-h-[430px]"
    >
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
          {visible.map((transfer) => {
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
            const abierta = abiertas.includes(transfer.id);
            const primerProducto = transfer.items[0]
              ? (productNames.get(transfer.items[0].productId) ??
                "Producto del catálogo")
              : "Sin productos";
            return (
              <article
                key={transfer.id}
                className="px-5 py-3 transition-colors hover:bg-slate-50/70"
              >
                {/* Clic en cualquier parte de la fila despliega los productos;
                    con teclado, el resumen de la derecha hace lo mismo. */}
                <div
                  onClick={() => alternar(transfer.id)}
                  className="flex cursor-pointer flex-wrap items-center gap-3"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg ${status.iconColor}`}
                  >
                    <StatusIcon size={17} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${status.badge}`}
                      >
                        {status.label}
                      </span>
                      {transfer.porEnviar && (
                        <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Por enviar
                        </span>
                      )}
                      <time
                        dateTime={transfer.createdAt}
                        className="text-xs text-slate-500"
                      >
                        {new Date(transfer.createdAt).toLocaleDateString(
                          "es-AR",
                        )}
                      </time>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                      <span>
                        {branchNames.get(transfer.sourceBranchId) ?? "Origen"}
                      </span>
                      <ArrowLeftRight
                        size={14}
                        aria-hidden
                        className="text-teal-600"
                      />
                      <span>
                        {branchNames.get(transfer.destinationBranchId) ??
                          "Destino"}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-expanded={abierta}
                    aria-controls={`productos-${transfer.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      alternar(transfer.id);
                    }}
                    className="flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-500 hover:bg-slate-50 hover:text-teal-700 sm:max-w-[45%]"
                  >
                    <span className="min-w-0 truncate text-xs">
                      {primerProducto}
                      {transfer.items.length > 1
                        ? ` y ${transfer.items.length - 1} más`
                        : ""}{" "}
                      · {totalUnits} un.
                    </span>
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={`shrink-0 transition-transform ${abierta ? "rotate-180" : ""}`}
                    />
                  </button>
                  {action ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAdvance(transfer);
                      }}
                      className="h-8 shrink-0 rounded-lg border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-50"
                    >
                      {busyId === transfer.id ? "Procesando…" : action}
                    </button>
                  ) : null}
                </div>
                {abierta && (
                  <ul
                    id={`productos-${transfer.id}`}
                    className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60"
                  >
                    {transfer.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm"
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
                )}
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
      {transfers.length > TRANSFERENCIAS_POR_PAGINA && (
        <div className="mt-auto">
          <Pagination
            integrated
            total={transfers.length}
            currentPage={current}
            totalPages={totalPages}
            noun="transferencias"
            label="Páginas de transferencias"
            pageSize={TRANSFERENCIAS_POR_PAGINA}
            onChange={cambiarPagina}
          />
        </div>
      )}
    </section>
  );
}
