import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PurchaseHelp, PurchaseExitDialog } from "./purchase-dialog-extras";
import { ReceiptDebtFields } from "./supplier-payables/receipt-debt";
import {
  suggestedDebt,
  receiptDebtBody,
  type ReceiptDebtDraft,
} from "./supplier-payables/receipt-debt-rules";
import { PurchaseReceptionProgress } from "./purchase-reception-progress";
import { ProductThumbnail } from "./product-image";
import { SupplierPayablesWorkspace } from "./supplier-payables/workspace";
import {
  Plus,
  Search,
  X,
  Eye,
  PackageCheck,
  ShoppingBag,
  FileText,
  ArrowLeft,
  Ban,
} from "lucide-react";
import {
  getParties,
  getPurchases,
  type CatalogProduct,
  type Party,
  type Purchase,
} from "./lib/api";
import {
  preparePurchaseLines,
  PurchaseRequestError,
  prepareReceiptLines,
  purchasePending,
  purchaseRequest,
  purchaseStatus,
  type PurchaseDetail,
  type PurchaseDraftLine,
  type ReceiptDraft,
} from "./lib/purchases";
import { SearchableSaleSelect } from "./searchable-sale-select";
import { Pagination } from "./pagination";
import { OperationHistory } from "./operation-history";
import { OperationConfirmDialog } from "./operation-confirm-dialog";

const field =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";
const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 text-sm font-medium text-teal-800 disabled:opacity-50";
const money = (n: number) =>
  (n / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
type Draft = {
  debt?: ReceiptDebtDraft;
  mode: "order" | "direct" | "receive";
  step: "edit" | "receive";
  supplierId: string;
  reference: string;
  notes: string;
  orderedAt: string;
  lines: PurchaseDraftLine[];
  lots: ReceiptDraft[];
  purchase?: Purchase;
  operationId: string;
  locked?: { path: string; body: Record<string, unknown> };
};
const fresh = (): Draft => ({
  mode: "order",
  step: "edit",
  supplierId: "",
  reference: "",
  notes: "",
  orderedAt: "",
  lines: [],
  lots: [],
  operationId: crypto.randomUUID(),
});
const lotRow = (itemId: string): ReceiptDraft => ({
  key: crypto.randomUUID(),
  itemId,
  quantity: "",
  lotNumber: "",
  expiresAt: "",
});

export function PurchasesWorkspace({
  token,
  organizationId,
  branchId,
  branchName,
  userKey,
  products,
  branches,
  toolbarTarget,
  onChanged,
  initialPurchaseId,
  onInitialConsumed,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  userKey: string;
  products: CatalogProduct[];
  branches: { id: string; name: string }[];
  toolbarTarget: HTMLElement | null;
  onChanged: () => void;
  initialPurchaseId?: string;
  onInitialConsumed?: () => void;
}) {
  const storageKey = `purchase-draft-v2:${userKey}:${organizationId}:${branchId}`;
  const [showPayables, setShowPayables] = useState(false);
  const [cancelPurchase, setCancelPurchase] = useState<Purchase>();
  const [invoicePurchaseId, setInvoicePurchaseId] = useState<string>();
  const consumeInvoicePurchase = useCallback(
    () => setInvoicePurchaseId(undefined),
    [],
  );
  const [draft, setDraft] = useState<Draft | undefined>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      return d.operationId && Array.isArray(d.lines) && Array.isArray(d.lots)
        ? d
        : undefined;
    } catch {
      return;
    }
  });
  const [rows, setRows] = useState<Purchase[]>([]),
    [suppliers, setSuppliers] = useState<Party[]>([]);
  const [detail, setDetail] = useState<PurchaseDetail>();
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [supplierFilter, setSupplierFilter] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1);
  const [search, setSearch] = useState(""),
    [receiptSearch, setReceiptSearch] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [discard, setDiscard] = useState(false),
    [closeReason, setCloseReason] = useState("");
  const pending = useRef(false),
    searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!initialPurchaseId) return;
    if (draft) {
      setNotice(
        "Hay un borrador guardado. Terminá o descartalo antes de abrir otra compra.",
      );
      onInitialConsumed?.();
      return;
    }
    let active = true;
    void purchaseRequest<PurchaseDetail>(
      token,
      organizationId,
      branchId,
      `/${initialPurchaseId}`,
    )
      .then((p) => {
        if (active) {
          setDetail(p);
          setOpen(true);
        }
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "No se pudo abrir la compra.",
          );
      })
      .finally(() => {
        if (active) onInitialConsumed?.();
      });
    return () => {
      active = false;
    };
  }, [
    initialPurchaseId,
    onInitialConsumed,
    draft,
    token,
    organizationId,
    branchId,
  ]);
  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem(storageKey, JSON.stringify(draft));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* El borrador en memoria sigue disponible. */
    }
  }, [draft, storageKey]);
  useEffect(() => {
    if (!draft) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [draft]);
  const load = async () => {
    const purchases = await getPurchases(token, organizationId, branchId);
    setRows(purchases);
  };
  useEffect(() => {
    let alive = true;
    void Promise.all([
      getPurchases(token, organizationId, branchId),
      getParties(token, organizationId, "suppliers").catch(() => []),
    ])
      .then(([p, s]) => {
        if (alive) {
          setRows(p);
          setSuppliers(s);
        }
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof Error ? e.message : "No se pudo cargar Compras.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, organizationId, branchId]);
  const patch = (value: Partial<Draft>) => {
    setDraft((d) => (d && !d.locked ? { ...d, ...value } : d));
    setReviewed(false);
  };
  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? "Producto histórico";
  const availableProduct = (p: CatalogProduct) =>
    p.active && (!p.branchStatus || p.branchStatus === "ACTIVE");
  const matches = (p: CatalogProduct, q: string) =>
    `${p.name} ${p.barcodes.map((b) => b.code).join(" ")}`
      .toLocaleLowerCase("es-AR")
      .includes(q.trim().toLocaleLowerCase("es-AR"));
  const openDetail = async (id: string) => {
    if (draft) {
      setNotice("Terminá o descartá el borrador antes de abrir otra compra.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setDetail(
        await purchaseRequest<PurchaseDetail>(
          token,
          organizationId,
          branchId,
          `/${id}`,
        ),
      );
      setOpen(true);
      setCloseReason("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar el detalle.",
      );
    } finally {
      setBusy(false);
    }
  };
  const receive = async (purchase: Purchase) => {
    setBusy(true);
    try {
      const p = await purchaseRequest<PurchaseDetail>(
        token,
        organizationId,
        branchId,
        `/${purchase.id}`,
      );
      setDraft({
        ...fresh(),
        mode: "receive",
        step: "receive",
        purchase: p,
        supplierId: p.supplierId,
        debt: p.hasRegisteredDebt
          ? { enabled: false, dueOn: "" }
          : suggestedDebt(suppliers.find((s) => s.id === p.supplierId)),
        lots: p.items
          .filter((i) => purchasePending(i) > 0)
          .map((i) => lotRow(i.id)),
      });
      setDetail(undefined);
      setReviewed(false);
      setError("");
      setReceiptSearch("");
      setOpen(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo actualizar la compra.",
      );
    } finally {
      setBusy(false);
    }
  };
  const newPurchase = () => {
    setDetail(undefined);
    setDraft((d) => d ?? fresh());
    setDiscard(false);
    setOpen(true);
    setError("");
  };
  const add = (p: CatalogProduct) => {
    if (!draft || draft.locked) return;
    const existing = draft.lines.find((l) => l.productId === p.id);
    if (existing) {
      setNotice("El producto ya está agregado. Revisá su cantidad.");
      document.getElementById(`purchase-quantity-${p.id}`)?.focus();
    } else if (draft.lines.length >= 100)
      setError("Máximo 100 productos por compra.");
    else {
      patch({
        lines: [...draft.lines, { productId: p.id, quantity: "1", cost: "" }],
      });
      searchInput.current?.focus();
    }
    setSearch("");
  };
  const currentItems: Purchase["items"] =
    draft?.purchase?.items ??
    draft?.lines.map((l) => ({
      id: l.productId,
      productId: l.productId,
      orderedQuantity: Number(l.quantity),
      receivedQuantity: 0,
      unitCostMinor: String(Math.round(Number(l.cost) * 100)),
    })) ??
    [];
  const selectedQuantity =
    draft?.lots.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0) ?? 0;
  const receiptEstimateMinor =
    draft?.lots.reduce((sum, l) => {
      const quantity = Number(l.quantity),
        cost =
          currentItems.find((i) => i.id === l.itemId)?.unitCostMinor ?? "0";
      return (
        sum +
        (Number.isSafeInteger(quantity) && quantity > 0 && /^\d+$/.test(cost)
          ? BigInt(quantity) * BigInt(cost)
          : 0n)
      );
    }, 0n) ?? 0n;
  const receiptEstimate = `${receiptEstimateMinor / 100n},${String(receiptEstimateMinor % 100n).padStart(2, "0")}`;
  const pendingEstimateMinor = currentItems.reduce((sum, i) => {
    const quantity = purchasePending(i);
    return (
      sum +
      (Number.isSafeInteger(quantity) &&
      quantity > 0 &&
      /^\d+$/.test(i.unitCostMinor)
        ? BigInt(quantity) * BigInt(i.unitCostMinor)
        : 0n)
    );
  }, 0n);
  const pendingEstimate = `${pendingEstimateMinor / 100n},${String(pendingEstimateMinor % 100n).padStart(2, "0")}`;
  const totalPending = currentItems.reduce(
    (sum, i) => sum + purchasePending(i),
    0,
  );
  const totalCost =
    draft?.lines.reduce(
      (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.cost) || 0) * 100,
      0,
    ) ?? 0;
  const submit = async () => {
    if (!draft || pending.current) return;
    let request = draft.locked;
    try {
      if (!request) {
        if (draft.step === "receive" && !reviewed)
          throw new Error(
            "Revisá y confirmá las cantidades y lotes antes de registrar.",
          );
        if (draft.mode === "receive")
          request = {
            path: `/${draft.purchase!.id}/receipts/batch`,
            body: {
              operationId: draft.operationId,
              notes: draft.notes,
              debt: receiptDebtBody(draft.debt, receiptEstimate),
              items: prepareReceiptLines(draft.lots, currentItems),
            },
          };
        else {
          if (!draft.supplierId) throw new Error("Seleccioná un proveedor.");
          const body = {
            clientOperationId: draft.operationId,
            supplierId: draft.supplierId,
            reference: draft.reference,
            notes: draft.notes,
            orderedAt: draft.orderedAt || undefined,
            items: preparePurchaseLines(draft.lines),
          };
          if (draft.mode === "direct" && draft.step === "edit") {
            patch({
              step: "receive",
              debt:
                draft.debt ??
                suggestedDebt(suppliers.find((s) => s.id === draft.supplierId)),
              lots: draft.lines.flatMap((l) => {
                const previous = draft.lots.filter(
                  (r) => r.itemId === l.productId,
                );
                return previous.length ? previous : [lotRow(l.productId)];
              }),
            });
            return;
          }
          request =
            draft.mode === "direct"
              ? {
                  path: "/direct",
                  body: {
                    ...body,
                    debt: receiptDebtBody(draft.debt, receiptEstimate),
                    receipts: prepareReceiptLines(draft.lots, currentItems).map(
                      ({ itemId, ...line }) => ({ ...line, productId: itemId }),
                    ),
                  },
                }
              : { path: "", body };
        }
      }
      pending.current = true;
      setBusy(true);
      setError("");
      const locked = { ...draft, locked: request };
      // Persistir la misma solicitud antes de enviarla permite reintentar tras perder la respuesta.
      sessionStorage.setItem(storageKey, JSON.stringify(locked));
      setDraft(locked);
      await purchaseRequest(
        token,
        organizationId,
        branchId,
        request.path,
        request.body,
      );
      setDraft(undefined);
      sessionStorage.removeItem(storageKey);
      setOpen(false);
      setNotice(
        draft.step === "receive"
          ? draft.debt?.enabled
            ? "Recepción y deuda registradas. Podés consultar el importe en Cuentas por pagar."
            : "Recepción registrada sin generar deuda. Sólo se ingresaron las cantidades confirmadas."
          : "Pedido guardado sin modificar stock.",
      );
      await load();
      onChanged();
    } catch (e) {
      if (
        e instanceof PurchaseRequestError &&
        [400, 403, 404].includes(e.status)
      )
        setDraft((current) =>
          current ? { ...current, locked: undefined } : current,
        );
      if (
        e instanceof PurchaseRequestError &&
        e.status === 409 &&
        draft.purchase
      ) {
        try {
          const latest = await purchaseRequest<PurchaseDetail>(
            token,
            organizationId,
            branchId,
            `/${draft.purchase.id}`,
          );
          if (
            !latest.receipts.some((r) => r.operationId === draft.operationId)
          ) {
            setDraft((current) =>
              current
                ? {
                    ...current,
                    purchase: latest,
                    locked: undefined,
                    ...(latest.hasRegisteredDebt
                      ? { debt: { enabled: false, dueOn: "" } }
                      : {}),
                  }
                : current,
            );
            setReviewed(false);
          }
        } catch {
          /* Ante resultado incierto se conserva la misma solicitud. */
        }
      }
      if (
        e instanceof PurchaseRequestError &&
        e.status === 409 &&
        !draft.purchase
      ) {
        try {
          const latest = await getPurchases(token, organizationId, branchId);
          if (!latest.some((p) => p.clientOperationId === draft.operationId)) {
            setDraft((current) =>
              current ? { ...current, locked: undefined } : current,
            );
            setReviewed(false);
          }
        } catch {
          /* No cambiar una solicitud cuyo resultado no se pudo verificar. */
        }
      }
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Reintentá la misma solicitud.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const close = () => {
    if (busy) return;
    if (draft) {
      setDiscard(true);
      return;
    }
    setOpen(false);
    setDetail(undefined);
  };
  const filtered = rows.filter(
    (p) =>
      (!status || p.status === status) &&
      (!supplierFilter || p.supplierId === supplierFilter) &&
      (!from || (p.orderedAt ?? p.createdAt).slice(0, 10) >= from) &&
      (!to || (p.orderedAt ?? p.createdAt).slice(0, 10) <= to) &&
      `${p.id} ${p.reference ?? ""} ${p.supplierName ?? ""} ${p.items
        .map(
          (i) =>
            `${productName(i.productId)} ${
              products
                .find((pr) => pr.id === i.productId)
                ?.barcodes.map((b) => b.code)
                .join(" ") ?? ""
            }`,
        )
        .join(" ")}`
        .toLocaleLowerCase("es-AR")
        .includes(query.toLocaleLowerCase("es-AR")),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages);
  const actions = (
    <>
      <button
        type="button"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-500"
        onClick={() => setShowPayables((value) => !value)}
      >
        {showPayables ? <ArrowLeft size={16} /> : <FileText size={16} />}
        {showPayables ? "Volver a Compras" : "Cuentas por pagar"}
      </button>
      <OperationHistory
        compact
        kind="Compras"
        token={token}
        organizationId={organizationId}
        branchId={branchId}
        products={products}
        branches={branches}
        onPurchase={(id) => void openDetail(id)}
      />
    </>
  );
  return (
    <>
      {toolbarTarget ? (
        createPortal(actions, toolbarTarget)
      ) : (
        <div className="mb-3 flex justify-end gap-2">{actions}</div>
      )}
      {cancelPurchase && (
        <OperationConfirmDialog
          title={
            cancelPurchase.status === "PARTIALLY_RECEIVED"
              ? "Cancelar pendiente"
              : "Cancelar compra"
          }
          description={`Compra ${cancelPurchase.reference || cancelPurchase.id.slice(0, 8).toUpperCase()}. Se cancelarán únicamente las unidades pendientes. Se conservarán el historial, lo recibido y las deudas registradas. No se podrá seguir recibiendo esta compra.`}
          requireReason
          onClose={() => setCancelPurchase(undefined)}
          onConfirm={async (reason) => {
            await purchaseRequest(
              token,
              organizationId,
              branchId,
              `/${cancelPurchase.id}/close-balance`,
              {
                reason,
                expected: cancelPurchase.items.map((i) => ({
                  itemId: i.id,
                  pending: purchasePending(i),
                })),
              },
            );
            setNotice(
              "Pendiente cancelado. Se conservó el historial de la compra.",
            );
            await load();
            onChanged();
          }}
        />
      )}
      {!open && error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 text-sm text-teal-700">
          {notice}
        </p>
      )}
      {showPayables && (
        <SupplierPayablesWorkspace
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          branchName={branchName}
          userKey={userKey}
          initialPurchaseId={invoicePurchaseId}
          onInitialConsumed={consumeInvoicePurchase}
          onPurchase={(id) => {
            setShowPayables(false);
            void openDetail(id);
          }}
        />
      )}
      {!showPayables && (
        <section className="purchases-table-panel flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div
            className="grid shrink-0 items-end gap-2 border-b border-slate-200 p-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
            onChange={() => setPage(1)}
          >
            <label className="text-xs text-slate-500">
              Buscar
              <input
                className={field}
                placeholder="Producto, código, proveedor o referencia"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Estado
              <select
                className={field}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos</option>
                {["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {purchaseStatus({ status: s as Purchase["status"] })}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Proveedor
              <select
                className={field}
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {suppliers.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Desde
              <input
                type="date"
                className={field}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Hasta
              <input
                type="date"
                className={field}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button
              className={`${button} whitespace-nowrap bg-teal-700 text-white`}
              onClick={newPurchase}
            >
              <Plus size={16} />
              {draft ? "Continuar borrador" : "Nueva compra"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
                <tr>
                  {[
                    "Nº / Fecha",
                    "Proveedor",
                    "Productos",
                    "Recepción",
                    "Total estimado",
                    "Estado",
                    "Acciones",
                  ].map((h) => (
                    <th className="p-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((current - 1) * 10, current * 10).map((p) => (
                  <tr
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                    key={p.id}
                  >
                    <td className="p-3">
                      <span className="font-medium">
                        {p.reference || p.id.slice(0, 8).toUpperCase()}
                      </span>
                      <p className="text-xs text-slate-500">
                        {new Date(
                          p.orderedAt ?? p.createdAt,
                        ).toLocaleDateString("es-AR")}
                      </p>
                    </td>
                    <td className="p-3">
                      {p.supplierName ??
                        suppliers.find((s) => s.id === p.supplierId)?.name}
                    </td>
                    <td className="p-3">
                      {p.items.length}{" "}
                      {p.items.length === 1 ? "artículo" : "artículos"}
                    </td>
                    <td className="p-3">
                      <PurchaseReceptionProgress purchase={p} />
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {money(
                        p.items.reduce(
                          (n, i) =>
                            n + i.orderedQuantity * Number(i.unitCostMinor),
                          0,
                        ),
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-2 whitespace-nowrap text-xs font-medium ${
                          p.closedAt || p.status === "CANCELLED"
                            ? "text-slate-500"
                            : p.status === "PARTIALLY_RECEIVED"
                              ? "text-amber-700"
                              : p.status === "RECEIVED"
                                ? "text-emerald-700"
                                : "text-slate-500"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                        />
                        {purchaseStatus(p)}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        disabled={busy}
                        className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-500 disabled:opacity-50 ${["ORDERED", "PARTIALLY_RECEIVED"].includes(p.status) ? "bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
                        onClick={() => void openDetail(p.id)}
                      >
                        {["ORDERED", "PARTIALLY_RECEIVED"].includes(
                          p.status,
                        ) ? (
                          <>
                            <PackageCheck size={15} />
                            Recibir
                          </>
                        ) : (
                          <>
                            <Eye size={15} />
                            Ver detalle
                          </>
                        )}
                      </button>
                      {["ORDERED", "PARTIALLY_RECEIVED"].includes(p.status) &&
                        !p.closedAt && (
                          <button
                            disabled={busy}
                            className="ml-2 inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-slate-400 disabled:opacity-50"
                            onClick={() => setCancelPurchase(p)}
                          >
                            <Ban size={14} strokeWidth={1.6} />
                            {p.status === "PARTIALLY_RECEIVED"
                              ? "Cancelar pendiente"
                              : "Cancelar compra"}
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      {loading
                        ? "Consultando compras…"
                        : "No hay compras para estos filtros."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            integrated
            total={filtered.length}
            currentPage={current}
            totalPages={pages}
            noun="compras"
            label="Páginas de compras"
            onChange={setPage}
          />
        </section>
      )}
      {open && (
        <PurchaseDialog
          title={
            detail
              ? `Compra ${detail.reference || detail.id.slice(0, 8).toUpperCase()}`
              : draft?.step === "receive"
                ? "Recibir mercadería"
                : "Nueva compra"
          }
          close={discard ? () => setDiscard(false) : close}
          confirmation={
            discard && (
              <PurchaseExitDialog
                locked={Boolean(draft?.locked)}
                onContinue={() => setDiscard(false)}
                onSave={() => {
                  setDiscard(false);
                  setOpen(false);
                }}
                onDiscard={() => {
                  setDraft(undefined);
                  setOpen(false);
                  setDiscard(false);
                }}
              />
            )
          }
        >
          <p className="mb-4 text-xs text-slate-500">
            Sucursal destino: <strong>{branchName}</strong>. Los costos de
            compra no modifican precios de venta.
          </p>
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="mb-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-800"
            >
              {notice}
            </p>
          )}
          {detail && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>{detail.supplierName}</strong>
                  <p className="text-sm text-slate-500">
                    {purchaseStatus(detail)} · {detail.notes}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    onClick={() => {
                      setInvoicePurchaseId(detail.id);
                      setDetail(undefined);
                      setOpen(false);
                      setShowPayables(true);
                    }}
                  >
                    <FileText size={16} />
                    Registrar deuda
                  </button>
                  {["ORDERED", "PARTIALLY_RECEIVED"].includes(
                    detail.status,
                  ) && (
                    <button className={button} onClick={() => receive(detail)}>
                      <PackageCheck size={16} />
                      Recibir mercadería
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Producto",
                        "Pedido",
                        "Recibido",
                        "Pendiente",
                        "No entregado",
                        "Costo unitario",
                      ].map((h) => (
                        <th className="p-2" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((i) => (
                      <tr className="border-t border-slate-100" key={i.id}>
                        <td className="p-2">{productName(i.productId)}</td>
                        <td>{i.orderedQuantity}</td>
                        <td>{i.receivedQuantity}</td>
                        <td>{purchasePending(i)}</td>
                        <td>{i.cancelledQuantity ?? 0}</td>
                        <td>{money(Number(i.unitCostMinor))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="mb-2 mt-5 font-semibold">Entregas recibidas</h3>
              {!detail.receipts.length && !detail.legacyMovements.length && (
                <p className="text-sm text-slate-500">
                  Todavía no hay recepciones.
                </p>
              )}
              {detail.receipts.map((r) => (
                <section
                  key={r.id}
                  className="mb-3 rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium">
                    {new Date(r.createdAt).toLocaleString("es-AR")} ·{" "}
                    {r.actorName}
                  </p>
                  {r.notes && <p>{r.notes}</p>}
                  {r.items.map((i) => (
                    <p
                      key={i.id}
                      className="mt-1 text-slate-600"
                      title={`Movimiento: ${i.movementId}`}
                    >
                      {i.productName} · {i.quantity} un. · Lote {i.lotNumber} ·{" "}
                      {i.expiresAt
                        ? i.expiresAt.slice(0, 10)
                        : "Sin vencimiento"}{" "}
                      · Costo {money(Number(i.unitCostMinor))}
                    </p>
                  ))}
                </section>
              ))}
              {detail.legacyMovements.length > 0 && (
                <section className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-medium">
                    Entradas históricas — sin nueva acreditación
                  </p>
                  {detail.legacyMovements.map((m) => (
                    <p key={m.id}>
                      {new Date(m.occurredAt).toLocaleString("es-AR")} ·{" "}
                      {m.quantity} un. · Lote {m.lotNumber}
                    </p>
                  ))}
                </section>
              )}
              {detail.closedReason && (
                <p className="mt-4 text-sm">
                  Motivo de cierre de saldo: {detail.closedReason}
                </p>
              )}
              {["ORDERED", "PARTIALLY_RECEIVED"].includes(detail.status) && (
                <details className="mt-5 border-t border-slate-200 pt-3">
                  <summary className="cursor-pointer text-sm text-amber-800">
                    Cerrar saldo pendiente sin modificar lo recibido
                  </summary>
                  <label className="mt-3 block text-sm">
                    Motivo
                    <input
                      maxLength={300}
                      className={field}
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || closeReason.trim().length < 3}
                    className={`${button} mt-3`}
                    onClick={async () => {
                      if (pending.current) return;
                      pending.current = true;
                      setBusy(true);
                      try {
                        await purchaseRequest(
                          token,
                          organizationId,
                          branchId,
                          `/${detail.id}/close-balance`,
                          {
                            reason: closeReason,
                            expected: detail.items.map((i) => ({
                              itemId: i.id,
                              pending: purchasePending(i),
                            })),
                          },
                        );
                        setDetail(
                          await purchaseRequest<PurchaseDetail>(
                            token,
                            organizationId,
                            branchId,
                            `/${detail.id}`,
                          ),
                        );
                        await load();
                        onChanged();
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "No se pudo cerrar el saldo.",
                        );
                      } finally {
                        pending.current = false;
                        setBusy(false);
                      }
                    }}
                  >
                    Confirmar cierre del saldo
                  </button>
                </details>
              )}
            </>
          )}
          {draft && (
            <>
              {draft.locked && (
                <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">
                  Solicitud enviada. Si hubo una interrupción, reintentá sin
                  modificar los datos: no se duplicará la operación.
                </p>
              )}
              <fieldset disabled={busy || Boolean(draft.locked)}>
                {draft.step === "edit" ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-sm">
                        Proveedor
                        <SearchableSaleSelect
                          label="Proveedor"
                          floatingOptions
                          value={draft.supplierId}
                          options={suppliers
                            .filter((s) => s.active)
                            .map((s) => ({ value: s.id, label: s.name }))}
                          onChange={(supplierId) =>
                            patch({ supplierId, debt: undefined })
                          }
                        />
                      </label>
                      <div className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="purchase-mode">Modalidad</label>
                          <PurchaseHelp label="Ayuda sobre modalidad">
                            <strong>Pedido pendiente:</strong> guardá lo
                            encargado sin sumar stock. Después recibís lo que
                            vaya llegando.
                            <br />
                            <br />
                            <strong>Compra directa:</strong> la mercadería ya
                            llegó. Cargá los productos y confirmá cantidades y
                            lotes para ingresarlos al inventario.
                          </PurchaseHelp>
                        </div>
                        <select
                          id="purchase-mode"
                          className={field}
                          value={draft.mode}
                          onChange={(e) =>
                            patch({
                              mode: e.target.value as "order" | "direct",
                            })
                          }
                        >
                          <option value="order">Pedido pendiente</option>
                          <option value="direct">Compra directa</option>
                        </select>
                      </div>
                      <div className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="purchase-reference">
                            Factura / remito / referencia
                          </label>
                          <PurchaseHelp label="Ayuda sobre factura, remito o referencia">
                            Dato opcional para identificar el comprobante del
                            proveedor, por ejemplo: Factura 0003-001245 o Remito
                            582.
                            <br />
                            <br />
                            Sirve para buscar la compra y relacionarla con el
                            comprobante. No genera una factura ni registra un
                            pago.
                          </PurchaseHelp>
                        </div>
                        <input
                          id="purchase-reference"
                          maxLength={120}
                          className={field}
                          value={draft.reference}
                          onChange={(e) => patch({ reference: e.target.value })}
                        />
                      </div>
                      <label className="text-sm">
                        Fecha (opcional)
                        <input
                          type="date"
                          className={field}
                          value={draft.orderedAt}
                          onChange={(e) => patch({ orderedAt: e.target.value })}
                        />
                      </label>
                    </div>
                    <div
                      className="relative my-4"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget))
                          setSearch("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && search) {
                          event.preventDefault();
                          event.stopPropagation();
                          setSearch("");
                          searchInput.current?.focus();
                        }
                      }}
                    >
                      <label className="relative block text-sm">
                        <Search
                          size={16}
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-600"
                        />
                        <input
                          ref={searchInput}
                          aria-label="Buscar o escanear un producto"
                          placeholder="Buscar o escanear un producto"
                          className={`${field} pl-10`}
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const exact = products.find(
                                (p) =>
                                  availableProduct(p) &&
                                  p.barcodes.some(
                                    (b) => b.code === search.trim(),
                                  ),
                              );
                              const found = products.filter(
                                (p) =>
                                  availableProduct(p) && matches(p, search),
                              );
                              if (exact) add(exact);
                              else if (search && found.length === 1)
                                add(found[0]!);
                              else
                                setError(
                                  "Elegí el producto de la lista de resultados.",
                                );
                            }
                          }}
                        />
                      </label>
                      {search && (
                        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-teal-100 bg-white shadow-lg shadow-slate-200/60">
                          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
                            <span className="font-medium">
                              Productos encontrados
                            </span>
                            <span>Seleccioná para agregar</span>
                          </div>
                          <div className="max-h-52 space-y-1 overflow-y-auto p-1.5">
                            {products
                              .filter(
                                (p) =>
                                  availableProduct(p) && matches(p, search),
                              )
                              .slice(0, 30)
                              .map((p) => {
                                const included = draft.lines.some(
                                  (line) => line.productId === p.id,
                                );
                                const code =
                                  p.barcodes.find((barcode) => barcode.primary)
                                    ?.code ?? p.barcodes[0]?.code;
                                return (
                                  <button
                                    type="button"
                                    key={p.id}
                                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-teal-50 focus-visible:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-500"
                                    onClick={() => add(p)}
                                  >
                                    <ProductThumbnail
                                      token={token}
                                      organizationId={organizationId}
                                      productId={p.id}
                                      name={p.name}
                                      version={p.image?.updatedAt}
                                      preview={false}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-slate-800">
                                        {p.name}
                                      </span>
                                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                                        {[
                                          p.laboratory?.name,
                                          p.presentation,
                                          code,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ") ||
                                          "Sin datos adicionales"}
                                      </span>
                                    </span>
                                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-100 bg-white px-2.5 py-1.5 text-xs font-medium text-teal-700 group-hover:border-teal-300">
                                      {!included && <Plus size={14} />}
                                      {included ? "En la compra" : "Agregar"}
                                    </span>
                                  </button>
                                );
                              })}
                            {!products.some(
                              (p) => availableProduct(p) && matches(p, search),
                            ) && (
                              <p className="px-3 py-5 text-center text-sm text-slate-500">
                                No encontramos productos con ese nombre o
                                código.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="max-h-[32dvh] overflow-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            {[
                              "Producto",
                              "Cantidad",
                              "Costo unitario ($)",
                              "Subtotal",
                              "",
                            ].map((h, i) => (
                              <th key={i} className="p-2">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {draft.lines.map((l, index) => (
                            <tr
                              className="border-t border-slate-100"
                              key={l.productId}
                            >
                              <td className="p-2">
                                {productName(l.productId)}
                              </td>
                              <td className="w-28 p-2">
                                <input
                                  id={`purchase-quantity-${l.productId}`}
                                  aria-label={`Cantidad de ${productName(l.productId)}`}
                                  className={field}
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={l.quantity}
                                  onChange={(e) =>
                                    patch({
                                      lines: draft.lines.map((r, i) =>
                                        i === index
                                          ? { ...r, quantity: e.target.value }
                                          : r,
                                      ),
                                    })
                                  }
                                />
                              </td>
                              <td className="w-40 p-2">
                                <input
                                  aria-label={`Costo de ${productName(l.productId)}`}
                                  className={field}
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={l.cost}
                                  onChange={(e) =>
                                    patch({
                                      lines: draft.lines.map((r, i) =>
                                        i === index
                                          ? { ...r, cost: e.target.value }
                                          : r,
                                      ),
                                    })
                                  }
                                />
                              </td>
                              <td className="p-2 whitespace-nowrap">
                                {money(
                                  (Number(l.cost) || 0) *
                                    (Number(l.quantity) || 0) *
                                    100,
                                )}
                              </td>
                              <td>
                                <button
                                  aria-label={`Quitar ${productName(l.productId)}`}
                                  className="p-2 text-rose-600"
                                  onClick={() =>
                                    patch({
                                      lines: draft.lines.filter(
                                        (_, i) => i !== index,
                                      ),
                                    })
                                  }
                                >
                                  <X size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!draft.lines.length && (
                        <p className="p-8 text-center text-sm text-slate-500">
                          Agregá los productos de esta compra.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-slate-600">
                      Cargá sólo lo que llegó. Las filas en cero quedan
                      pendientes. Escanear identifica el producto; no completa
                      lote ni vencimiento.
                    </p>
                    <input
                      className={`${field} mb-3`}
                      aria-label="Buscar artículo de la recepción"
                      placeholder="Buscar o escanear dentro de esta compra"
                      value={receiptSearch}
                      onChange={(e) => setReceiptSearch(e.target.value)}
                    />
                    <div className="max-h-[36dvh] space-y-3 overflow-auto">
                      {currentItems
                        .filter(
                          (i) =>
                            !receiptSearch ||
                            `${productName(i.productId)} ${
                              products
                                .find((p) => p.id === i.productId)
                                ?.barcodes.map((b) => b.code)
                                .join(" ") ?? ""
                            }`
                              .toLowerCase()
                              .includes(receiptSearch.toLowerCase()),
                        )
                        .map((i) => (
                          <section
                            key={i.id}
                            className="rounded-xl border border-slate-200 p-3"
                          >
                            <div className="mb-2 flex flex-wrap justify-between gap-2">
                              <strong className="text-sm">
                                {productName(i.productId)}
                              </strong>
                              <span className="text-xs text-slate-500">
                                Pedido {i.orderedQuantity} · Recibido{" "}
                                {i.receivedQuantity} · Pendiente{" "}
                                {purchasePending(i)}
                              </span>
                            </div>
                            {draft.lots
                              .filter((l) => l.itemId === i.id)
                              .map((l) => (
                                <div
                                  key={l.key}
                                  className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_2fr_2fr_auto]"
                                >
                                  <label className="text-xs text-slate-500">
                                    Recibo ahora
                                    <input
                                      className={field}
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={l.quantity}
                                      onChange={(e) =>
                                        patch({
                                          lots: draft.lots.map((r) =>
                                            r.key === l.key
                                              ? {
                                                  ...r,
                                                  quantity: e.target.value,
                                                }
                                              : r,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Lote
                                    <input
                                      className={field}
                                      maxLength={100}
                                      value={l.lotNumber}
                                      onChange={(e) =>
                                        patch({
                                          lots: draft.lots.map((r) =>
                                            r.key === l.key
                                              ? {
                                                  ...r,
                                                  lotNumber: e.target.value,
                                                }
                                              : r,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Vencimiento
                                    <input
                                      type="date"
                                      className={field}
                                      value={l.expiresAt}
                                      onChange={(e) =>
                                        patch({
                                          lots: draft.lots.map((r) =>
                                            r.key === l.key
                                              ? {
                                                  ...r,
                                                  expiresAt: e.target.value,
                                                }
                                              : r,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <button
                                    className="self-end p-2 text-rose-600"
                                    aria-label="Quitar lote"
                                    onClick={() =>
                                      patch({
                                        lots: draft.lots.filter(
                                          (r) => r.key !== l.key,
                                        ),
                                      })
                                    }
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ))}
                            {purchasePending(i) > 0 && (
                              <button
                                className="text-xs font-medium text-teal-700"
                                onClick={() =>
                                  patch({ lots: [...draft.lots, lotRow(i.id)] })
                                }
                              >
                                + Agregar lote
                              </button>
                            )}
                          </section>
                        ))}
                    </div>
                  </>
                )}
                {draft.step === "receive" && (
                  <ReceiptDebtFields
                    registered={draft.purchase?.hasRegisteredDebt}
                    value={draft.debt ?? { enabled: false, dueOn: "" }}
                    estimated={receiptEstimate}
                    pendingEstimate={
                      selectedQuantity === 0 ? pendingEstimate : undefined
                    }
                    onChange={(debt) => patch({ debt })}
                  />
                )}
                <label className="mt-4 block text-sm">
                  Observaciones
                  <input
                    maxLength={1000}
                    className={field}
                    value={draft.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                </label>
                {draft.step === "receive" && (
                  <label className="mt-4 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    Revisé las cantidades reales, lotes y vencimientos de esta
                    entrega.
                  </label>
                )}
              </fieldset>
              <footer className="sticky -bottom-5 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white py-4">
                <p className="text-sm font-medium">
                  {draft.step === "receive"
                    ? `Recibo ahora: ${selectedQuantity} un. · Queda pendiente: ${Math.max(0, totalPending - selectedQuantity)} un.`
                    : `${draft.lines.length} productos · Importe estimado ${money(totalCost)}`}
                </p>
                <div className="flex gap-2">
                  <button className={button} disabled={busy} onClick={close}>
                    Cancelar
                  </button>
                  {draft.mode === "direct" &&
                    draft.step === "receive" &&
                    !draft.locked && (
                      <button
                        className={button}
                        onClick={() => patch({ step: "edit" })}
                      >
                        Volver a productos
                      </button>
                    )}
                  <button
                    className={`${button} bg-teal-700 text-white`}
                    disabled={
                      busy ||
                      (!draft.locked && draft.step === "receive" && !reviewed)
                    }
                    onClick={() => void submit()}
                  >
                    {busy
                      ? "Guardando…"
                      : draft.locked
                        ? "Reintentar misma solicitud"
                        : draft.step === "receive"
                          ? "Confirmar recepción"
                          : draft.mode === "direct"
                            ? "Continuar a recepción"
                            : "Guardar pedido"}
                  </button>
                </div>
              </footer>
            </>
          )}
        </PurchaseDialog>
      )}
    </>
  );
}

function PurchaseDialog({
  title,
  close,
  children,
  confirmation,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  confirmation?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={confirmation ? "Confirmar salida de la compra" : title}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className={`m-auto ${confirmation ? "w-[min(440px,calc(100vw-2rem))]" : "w-[min(1080px,calc(100vw-2rem))]"} max-w-[calc(100vw-2rem)] max-h-[90dvh] overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-950/35`}
    >
      {confirmation}
      <div hidden={Boolean(confirmation)}>
        <header className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShoppingBag size={20} className="text-teal-700" />
            {title}
          </h2>
          <button
            aria-label="Cerrar compra"
            className="p-2 text-slate-500"
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
