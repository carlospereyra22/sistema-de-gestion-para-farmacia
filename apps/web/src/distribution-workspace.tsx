import { useEffect, useRef, useState } from "react";
import { distributionPrint } from "./lib/distribution-print";
import { DistributionProductSearch } from "./distribution-product-search";
import { DistributionImportReview } from "./distribution-import-review";
import { Truck, X, Trash2, History, ArrowLeft } from "lucide-react";
import {
  distributionRequest,
  DistributionRejected,
  type DistributionDocument,
  type DistributionRequest,
  type CatalogProduct,
  type StockLot,
} from "./lib/api";
import { printTicketFrame } from "./lib/browser-ticket-print";

type Draft = {
  destination: string;
  reason: string;
  items: { lotId: string; quantity: number }[];
  pending?: DistributionRequest;
};
const emptyDraft = (): Draft => ({
  destination: "",
  reason: "Distribución externa",
  items: [],
});
function readDraft(key: string): Draft {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(key) || "null",
    ) as Draft | null;
    if (
      value &&
      typeof value.destination === "string" &&
      typeof value.reason === "string" &&
      Array.isArray(value.items) &&
      value.items.length <= 200 &&
      value.items.every(
        (i) =>
          typeof i.lotId === "string" &&
          Number.isInteger(i.quantity) &&
          i.quantity > 0,
      ) &&
      (!value.pending ||
        (typeof value.pending.requestId === "string" &&
          Array.isArray(value.pending.items)))
    )
      return value;
  } catch {
    /* A new draft is safe: no request is submitted on load. */
  }
  return emptyDraft();
}

export function DistributionWorkspace({
  token,
  organizationId,
  branchId,
  userKey,
  products,
  stock,
  done,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  userKey: string;
  products: CatalogProduct[];
  stock: StockLot[];
  done: () => void;
}) {
  const storageKey = `distribution-draft:${userKey}:${organizationId}:${branchId}`;
  const [draft, setDraft] = useState<Draft>(() => readDraft(storageKey));
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<DistributionDocument[]>([]);
  const [selected, setSelected] = useState<DistributionDocument>();
  const [reversalReason, setReversalReason] = useState("");
  const [reverseConfirmed, setReverseConfirmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const scanner = useRef<HTMLInputElement>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const locked = useRef(false);
  const frozen = busy || Boolean(draft.pending);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setMessage(
        "No se pudo guardar el borrador en este navegador. No cierres esta pantalla.",
      );
    }
  }, [draft, storageKey]);
  useEffect(() => {
    const element = dialog.current;
    if (open) element?.showModal();
    return () => element?.close();
  }, [open]);
  const load = async () =>
    setHistory(
      await distributionRequest<DistributionDocument[]>(
        token,
        organizationId,
        branchId,
      ),
    );
  const lots = stock
    .filter((l) => l.productId === productId && l.sellableQuantity > 0)
    .sort(
      (a, b) =>
        (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999") ||
        a.id.localeCompare(b.id),
    );
  function choose(id: string) {
    setProductId(id);
    setQuery(products.find((product) => product.id === id)?.name || "");
    const available = stock
      .filter((l) => l.productId === id && l.sellableQuantity > 0)
      .sort(
        (a, b) =>
          (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999") ||
          a.id.localeCompare(b.id),
      );
    setLotId(available[0]?.id || "");
    setQuantity("1");
    window.requestAnimationFrame(() => {
      quantityInput.current?.focus();
      quantityInput.current?.select();
    });
  }
  function add() {
    const lot = lots.find((l) => l.id === lotId);
    const count = Number(quantity);
    const existing = draft.items.find((i) => i.lotId === lotId)?.quantity || 0;
    if (
      !lot ||
      !Number.isInteger(count) ||
      count < 1 ||
      existing + count > lot.sellableQuantity ||
      (draft.items.length >= 200 && !existing)
    ) {
      setMessage(
        "Revisá el lote y la cantidad disponible. Máximo 200 lotes por salida.",
      );
      return;
    }
    setDraft({
      ...draft,
      items: existing
        ? draft.items.map((i) =>
            i.lotId === lotId ? { ...i, quantity: i.quantity + count } : i,
          )
        : [...draft.items, { lotId, quantity: count }],
    });
    setMessage("");
    setQuery("");
    setProductId("");
    setLotId("");
    scanner.current?.focus();
    setConfirmed(false);
  }
  async function submit() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    const request = draft.pending || {
      requestId: crypto.randomUUID(),
      destination: draft.destination,
      reason: draft.reason,
      items: draft.items,
      confirmed,
    };
    try {
      const pending = { ...draft, pending: request };
      sessionStorage.setItem(storageKey, JSON.stringify(pending));
      setDraft(pending);
      const result = await distributionRequest<DistributionDocument>(
        token,
        organizationId,
        branchId,
        request,
      );
      setDraft(emptyDraft());
      sessionStorage.removeItem(storageKey);
      setConfirmed(false);
      setSelected(result);
      done();
      setMessage(
        result.reversedAt
          ? "Esta solicitud ya había sido registrada y revertida. No se descontó otra vez."
          : "Salida registrada. No se generaron ventas ni cobros.",
      );
      await load().catch(() =>
        setMessage(
          "Salida registrada; no se pudo actualizar el historial. Usá Actualizar historial.",
        ),
      );
    } catch (cause) {
      if (cause instanceof DistributionRejected)
        setDraft({ ...draft, pending: undefined });
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Resultado sin confirmar. Reintentá la misma solicitud.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function reverse() {
    if (!selected || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const doc = await distributionRequest<DistributionDocument>(
        token,
        organizationId,
        branchId,
        { reason: reversalReason, confirmed: reverseConfirmed },
        `/${selected.id}/reverse`,
      );
      setSelected(doc);
      setReversalReason("");
      setReverseConfirmed(false);
      done();
      await load();
      setMessage("Registro revertido. Se conserva el historial.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo revertir.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setShowHistory(false);
          void load().catch(() =>
            setMessage(
              "No se pudo cargar el historial. Reintentá Actualizar historial.",
            ),
          );
        }}
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-teal-200 bg-white px-4 text-sm font-medium text-teal-700"
      >
        <Truck size={17} />
        Distribuir
      </button>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          if (!busy) setOpen(false);
        }}
        className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl backdrop:bg-slate-950/40"
        aria-labelledby="distribution-title"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="distribution-title" className="text-xl font-semibold">
              {showHistory
                ? "Historial de distribución"
                : "Salida por distribución"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Destino externo · Sin ventas, caja ni cuenta corriente.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={frozen}
              onClick={() => {
                setShowImport(!showImport);
                setShowHistory(false);
              }}
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
            >
              {showImport ? "Volver a la salida" : "Importar PDF"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setShowHistory(!showHistory);
                setShowImport(false);
              }}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
            >
              {showHistory ? (
                <ArrowLeft size={17} aria-hidden="true" />
              ) : (
                <History size={17} aria-hidden="true" />
              )}
              {showHistory ? "Volver a la salida" : "Historial"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              aria-label="Cerrar distribución"
              className="rounded-lg p-2"
            >
              <X />
            </button>
          </div>
        </header>
        {message && (
          <p role="status" className="my-3 rounded-lg bg-slate-100 p-3 text-sm">
            {message}
          </p>
        )}
        {draft.pending && (
          <p className="my-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Solicitud pendiente de confirmar. Los datos están bloqueados para
            evitar duplicados. Reintentá la misma salida.
          </p>
        )}
        <div hidden={!showImport}>
          <DistributionImportReview
            products={products}
            stock={stock}
            reserved={draft.items}
            memoryKey={`distribution-matches:${userKey}:${organizationId}:${branchId}`}
            onPrepared={(items) => {
              if (frozen) return false;
              const merged = new Map(
                draft.items.map((item) => [item.lotId, item.quantity]),
              );
              for (const item of items)
                merged.set(
                  item.lotId,
                  (merged.get(item.lotId) ?? 0) + item.quantity,
                );
              if (merged.size > 200) {
                setMessage(
                  "La salida supera los 200 lotes. Dividí el pedido en varias salidas.",
                );
                return false;
              }
              setDraft({
                ...draft,
                items: [...merged].map(([lotId, quantity]) => ({
                  lotId,
                  quantity,
                })),
              });
              setConfirmed(false);
              setShowImport(false);
              setMessage(
                "Pedido agregado al borrador. Revisá los lotes físicos, indicá destino y confirmá la salida. Todavía no se descontó stock.",
              );
              return true;
            }}
            onBack={() => setShowImport(false)}
          />
        </div>
        {!showHistory && !showImport && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="mt-5 space-y-4"
          >
            <fieldset disabled={frozen} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Destino / destinatario
                <input
                  required
                  minLength={3}
                  maxLength={150}
                  value={draft.destination}
                  onChange={(e) =>
                    setDraft({ ...draft, destination: e.target.value })
                  }
                  className="mt-1 h-10 w-full border px-3"
                />
              </label>
              <label className="text-sm">
                Motivo / referencia
                <input
                  required
                  minLength={3}
                  maxLength={300}
                  value={draft.reason}
                  onChange={(e) =>
                    setDraft({ ...draft, reason: e.target.value })
                  }
                  className="mt-1 h-10 w-full border px-3"
                />
              </label>
            </fieldset>
            <fieldset
              disabled={frozen}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <DistributionProductSearch
                products={products}
                query={query}
                inputRef={scanner}
                onChange={(value) => {
                  setQuery(value);
                  setProductId("");
                  setLotId("");
                }}
                onSelect={choose}
              />
              {productId && (
                <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800">
                  Seleccionado:{" "}
                  {products.find((product) => product.id === productId)?.name}
                </p>
              )}
              <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_110px_auto]">
                <label className="text-sm">
                  Lote · primero vence, primero sale
                  <select
                    value={lotId}
                    onChange={(e) => setLotId(e.target.value)}
                    className="mt-1 h-10 w-full border bg-white px-2"
                  >
                    <option value="">Elegí producto y lote</option>
                    {lots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.number} · {l.sellableQuantity} disponibles ·{" "}
                        {l.expiresAt?.slice(0, 10) || "sin vencimiento"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Cantidad
                  <input
                    ref={quantityInput}
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                      }
                    }}
                    className="mt-1 h-10 w-full border bg-white px-2"
                  />
                </label>
                <button
                  type="button"
                  onClick={add}
                  className="h-10 rounded-lg bg-teal-700 px-4 text-white"
                >
                  Agregar
                </button>
              </div>
            </fieldset>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3">Producto / lote</th>
                    <th className="p-3">Salida</th>
                    <th className="p-3">Stock restante</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((i) => {
                    const lot = stock.find((l) => l.id === i.lotId);
                    return (
                      <tr key={i.lotId} className="border-t border-slate-100">
                        <td className="p-3">
                          {lot?.productName || "Lote no disponible"}
                          <small className="block text-slate-500">
                            {lot?.number || i.lotId}
                          </small>
                        </td>
                        <td className="p-3">
                          <input
                            aria-label={`Cantidad de ${lot?.productName || "lote"}`}
                            type="number"
                            min={1}
                            step={1}
                            required
                            disabled={frozen}
                            value={i.quantity}
                            onChange={(e) => {
                              setDraft({
                                ...draft,
                                items: draft.items.map((row) =>
                                  row.lotId === i.lotId
                                    ? {
                                        ...row,
                                        quantity: Number(e.target.value),
                                      }
                                    : row,
                                ),
                              });
                              setConfirmed(false);
                            }}
                            className="h-9 w-20 rounded border px-2"
                          />
                        </td>
                        <td className="p-3">
                          {lot ? lot.quantity - i.quantity : "Revisar"}
                        </td>
                        <td>
                          <button
                            type="button"
                            disabled={frozen}
                            aria-label={`Quitar ${lot?.productName || "lote"}`}
                            onClick={() => {
                              setDraft({
                                ...draft,
                                items: draft.items.filter(
                                  (row) => row.lotId !== i.lotId,
                                ),
                              });
                              setConfirmed(false);
                            }}
                            className="p-3 text-rose-600"
                          >
                            <Trash2 size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!draft.items.length && (
                <p className="p-5 text-center text-sm text-slate-500">
                  Agregá los productos que vas a retirar.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-w-0 items-start gap-2.5 text-sm leading-relaxed text-slate-600 sm:max-w-[70%]">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-teal-700"
                  disabled={frozen}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  Confirmo los lotes y cantidades de esta salida externa. El
                  cobro se gestiona por separado.
                </span>
              </label>
              <button
                disabled={
                  busy ||
                  (!draft.pending && (!confirmed || !draft.items.length))
                }
                className="shrink-0 whitespace-nowrap rounded-lg bg-teal-700 px-5 py-3 font-medium text-white disabled:opacity-50"
              >
                {busy
                  ? "Registrando…"
                  : draft.pending
                    ? "Reintentar misma salida"
                    : "Confirmar salida"}
              </button>
            </div>
          </form>
        )}
        {showHistory && (
          <section className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Salidas registradas</h3>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void load().catch(() =>
                    setMessage("No se pudo cargar el historial."),
                  )
                }
                className="text-sm text-teal-700"
              >
                Actualizar historial
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Últimas 100 salidas de esta sucursal.
            </p>
            <div className="mt-3 max-h-48 overflow-auto">
              {history.map((doc) => (
                <button
                  type="button"
                  key={doc.id}
                  onClick={() => {
                    setSelected(doc);
                    setReversalReason("");
                    setReverseConfirmed(false);
                  }}
                  className="block w-full border-b border-slate-100 p-3 text-left text-sm"
                >
                  {new Date(doc.createdAt).toLocaleString("es-AR")} ·{" "}
                  {doc.destination} · {doc.items.length} lotes{" "}
                  {doc.reversedAt ? "· Revertida" : ""}
                </button>
              ))}
            </div>
            {selected && (
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <h4 className="font-semibold">
                  {selected.destination} · {selected.id.slice(0, 8)}
                </h4>
                <p className="text-sm text-slate-500">{selected.reason}</p>
                <ul className="my-3 text-sm">
                  {selected.items.map((i) => (
                    <li key={i.lotId}>
                      {i.productName} · lote {i.lotNumber} · {i.quantity} un.
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    if (frame.current)
                      void printTicketFrame(frame.current).catch(() =>
                        setMessage("No se pudo imprimir."),
                      );
                  }}
                  className="text-sm text-teal-700 underline"
                >
                  Imprimir comprobante interno
                </button>
                <iframe
                  ref={frame}
                  title="Comprobante de distribución"
                  srcDoc={distributionPrint(selected)}
                  className="hidden"
                />
                {selected.reversedAt ? (
                  <p className="mt-3 text-sm">
                    Revertida: {selected.reversalReason}
                  </p>
                ) : (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-slate-500">
                      Corregir una salida registrada por error
                    </summary>
                    <p className="my-2 text-xs text-slate-500">
                      Sólo si la mercadería no salió físicamente. No usar para
                      devoluciones reales.
                    </p>
                    <input
                      aria-label="Motivo de reversión"
                      maxLength={300}
                      value={reversalReason}
                      onChange={(e) => setReversalReason(e.target.value)}
                      className="h-10 w-full border px-3"
                    />
                    <label className="my-2 flex gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={reverseConfirmed}
                        onChange={(e) => setReverseConfirmed(e.target.checked)}
                      />
                      Confirmo que fue un error de registro y la mercadería
                      sigue en la farmacia.
                    </label>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !reverseConfirmed ||
                        reversalReason.trim().length < 3
                      }
                      onClick={() => void reverse()}
                      className="rounded border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"
                    >
                      Revertir registro
                    </button>
                  </details>
                )}
              </div>
            )}
          </section>
        )}
      </dialog>
    </>
  );
}
