import { useEffect, useRef, useState } from "react";
import { History, X, Search } from "lucide-react";
import {
  getInventoryHistory,
  getPurchases,
  getTransfers,
  getParties,
  type CatalogProduct,
} from "./lib/api";
import { isOutsideDialog } from "./lib/dialog-bounds";
import { filterHistory } from "./lib/filter-operation-history";

type Kind = "Compras" | "Transferencias" | "Inventario";
type HistoryFilters = {
  query: string;
  status: string;
  from: string;
  to: string;
  page: number;
};
export type HistoryRow = {
  id: string;
  date: string;
  title: string;
  status: string;
  detail: string[];
  amount?: number;
};
const labels: Record<string, string> = {
  ORDERED: "Pendiente",
  PARTIALLY_RECEIVED: "Recepción parcial",
  BALANCE_CLOSED: "Saldo cerrado",
  RECEIVED: "Recibida",
  CANCELLED: "Anulada",
  DRAFT: "Borrador",
  PREPARED: "Preparada",
  IN_TRANSIT: "En tránsito",
  PURCHASE_RECEIPT: "Recepción",
  ADJUSTMENT_IN: "Ajuste de ingreso",
  ADJUSTMENT_OUT: "Ajuste de egreso",
  SUPPLIER_RETURN: "Devolución a proveedor",
  DISTRIBUTION: "Salida por distribución",
  DISTRIBUTION_REVERSAL: "Reversión de distribución",
};

export function OperationHistory(props: {
  compact?: boolean;
  kind: Kind;
  token: string;
  organizationId: string;
  branchId: string;
  products: CatalogProduct[];
  branches: { id: string; name: string }[];
  onPurchase?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<HistoryFilters>({
    query: "",
    status: "",
    from: "",
    to: "",
    page: 0,
  });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex ${props.compact ? "h-10 rounded-xl border-slate-200 px-3 text-slate-600" : "h-11 rounded-lg border-slate-300 px-4 text-teal-700"} items-center gap-2 border bg-white text-sm font-medium shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-500`}
      >
        <History size={16} />
        Historial
      </button>
      {open && (
        <HistoryDialog
          {...props}
          initialFilters={filters}
          onFilters={setFilters}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function HistoryDialog({
  kind,
  token,
  organizationId,
  branchId,
  products,
  branches,
  onClose,
  onPurchase,
  initialFilters,
  onFilters,
}: Parameters<typeof OperationHistory>[0] & {
  onClose: () => void;
  initialFilters: HistoryFilters;
  onFilters: (filters: HistoryFilters) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const outside = useRef(false);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(initialFilters.query);
  const [status, setStatus] = useState(initialFilters.status);
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);
  const [page, setPage] = useState(initialFilters.page);
  useEffect(() => {
    onFilters({ query, status, from, to, page });
  }, [query, status, from, to, page, onFilters]);
  const loadedScope = useRef("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let active = true;
    const scope = `${kind}:${organizationId}:${branchId}`;
    const initial = loadedScope.current !== scope;
    setLoading(initial);
    setError("");
    if (initial) setRows([]);
    const productName = (id: string) =>
      products.find((item) => item.id === id)?.name ?? `Producto ${id}`;
    const branchName = (id: string) =>
      branches.find((item) => item.id === id)?.name ?? "Sucursal no disponible";
    async function load(): Promise<HistoryRow[]> {
      if (kind === "Inventario")
        return (await getInventoryHistory(token, organizationId, branchId)).map(
          (item) => ({
            id: item.id,
            date: item.occurredAt,
            title: item.productName,
            status:
              item.referenceType === "DISTRIBUTION" ||
              item.referenceType === "DISTRIBUTION_REVERSAL"
                ? item.referenceType
                : item.type,
            detail: [
              `Lote: ${item.lotNumber ?? "Sin lote"}`,
              `Variación: ${item.quantity > 0 ? "+" : ""}${item.quantity} unidades`,
            ],
          }),
        );
      if (kind === "Compras") {
        const purchases = await getPurchases(token, organizationId, branchId);
        // El historial no requiere permiso de gestión de proveedores para ver una compra.
        const suppliers = await getParties(
          token,
          organizationId,
          "suppliers",
        ).catch(() => []);
        return purchases.map((item) => ({
          id: item.id,
          date: item.createdAt,
          title:
            item.supplierName ??
            suppliers.find((supplier) => supplier.id === item.supplierId)
              ?.name ??
            `Proveedor ${item.supplierId}`,
          status: item.closedAt ? "BALANCE_CLOSED" : item.status,
          amount: item.items.reduce(
            (sum, line) =>
              sum + Number(line.unitCostMinor) * line.orderedQuantity,
            0,
          ),
          detail: item.items.map(
            (line) =>
              `${productName(line.productId)} · ${
                products
                  .find((p) => p.id === line.productId)
                  ?.barcodes.map((b) => b.code)
                  .join(" ") ?? ""
              } · ${line.receivedQuantity}/${line.orderedQuantity} recibidas · ${line.cancelledQuantity ?? 0} no entregadas · Costo unitario ${money(Number(line.unitCostMinor))} · ${item.reference ?? ""}`,
          ),
        }));
      }
      return (await getTransfers(token, organizationId, branchId)).map(
        (item) => ({
          id: item.id,
          date: item.createdAt,
          title: `${branchName(item.sourceBranchId)} → ${branchName(item.destinationBranchId)}`,
          status: item.status,
          detail: item.items.map(
            (line) =>
              `${productName(line.productId)} · ${line.quantity} unidades · ${line.receivedQuantity} recibidas`,
          ),
        }),
      );
    }
    void load()
      .then((items) => {
        if (active) {
          loadedScope.current = scope;
          setRows(items);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el historial.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, token, organizationId, branchId, products, branches, retry]);
  const filtered = filterHistory(rows, query, status, from, to);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages - 1);
  const inputClass =
    "h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm";
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        outside.current = isOutsideDialog(
          event,
          event.currentTarget.getBoundingClientRect(),
        );
      }}
      onPointerCancel={() => {
        outside.current = false;
      }}
      onClick={(event) => {
        if (
          outside.current &&
          isOutsideDialog(event, event.currentTarget.getBoundingClientRect())
        )
          onClose();
        outside.current = false;
      }}
      aria-labelledby="operation-history-title"
      className="m-auto w-[calc(100%-2rem)] max-w-4xl rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl outline-none backdrop:bg-slate-950/35 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-[85dvh] flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-teal-50/60 px-6 py-5">
          <div>
            <h2
              id="operation-history-title"
              className="text-xl font-semibold text-slate-800"
            >
              Historial de {kind.toLowerCase()}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {branches.find((item) => item.id === branchId)?.name}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar historial"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-white"
          >
            <X size={20} />
          </button>
        </header>
        <div className="grid shrink-0 gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Search size={13} />
              Buscar
            </span>
            <input
              className={inputClass}
              placeholder="Producto, proveedor o código"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            {kind === "Inventario" ? "Movimiento" : "Estado"}
            <select
              className={inputClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="">Todos</option>
              {[...new Set(rows.map((item) => item.status))].map((value) => (
                <option key={value} value={value}>
                  {labels[value] ?? value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Desde
            <input
              type="date"
              className={inputClass}
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Hasta
            <input
              type="date"
              className={inputClass}
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 [scrollbar-gutter:stable]">
          {loading ? (
            <p role="status" className="p-6 text-center text-sm text-slate-500">
              Cargando historial…
            </p>
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
            >
              {error}
              <button
                type="button"
                className="ml-3 underline"
                onClick={() => setRetry((value) => value + 1)}
              >
                Reintentar
              </button>
            </div>
          ) : !filtered.length ? (
            <p className="p-8 text-center text-sm text-slate-500">
              {rows.length
                ? "No hay registros con estos filtros."
                : "Todavía no hay operaciones registradas."}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered
                .slice(currentPage * 20, currentPage * 20 + 20)
                .map((row) => (
                  <details
                    key={row.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <summary className="cursor-pointer text-sm">
                      <span className="ml-2 font-semibold text-slate-800">
                        {row.title}
                      </span>
                      <span className="ml-3 inline-block rounded-full bg-teal-50 px-2 py-1 text-xs text-teal-700">
                        {labels[row.status] ?? row.status}
                      </span>
                      <span className="mt-1 block pl-5 text-xs text-slate-500">
                        {new Date(row.date).toLocaleString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                        })}
                        {row.amount !== undefined
                          ? ` · Total pedido: ${money(row.amount)}`
                          : ""}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                      {row.detail.map((text, index) => (
                        <p key={index}>{text}</p>
                      ))}
                      <p className="break-all text-xs text-slate-400">
                        Referencia: {row.id}
                      </p>
                      {kind === "Compras" && onPurchase && (
                        <button
                          className="rounded-lg border border-teal-200 px-3 py-2 text-teal-700"
                          onClick={() => {
                            onClose();
                            onPurchase(row.id);
                          }}
                        >
                          Ver compra y recepciones
                        </button>
                      )}
                    </div>
                  </details>
                ))}
            </div>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
          <span>
            {!loading && !error ? `${filtered.length} registros` : ""}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              Anterior
            </button>
            {currentPage + 1} / {pages}
            <button
              type="button"
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
function money(value: number) {
  return (value / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
}
