import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scopeAccountItems } from "./lib/account-sale-scope";
import { accountPendingPreview } from "./lib/account-pending-preview";
import { accountCollectionAllocations } from "./lib/account-collection-allocation";
import { AccountAmountConfirmation } from "./account-amount-confirmation";
import { filterPendingSales } from "./lib/filter-pending-sales";
import { scrollSaleIntoView } from "./lib/scroll-sale-into-view";
import { createPortal } from "react-dom";
import { AccountDeliveryForm } from "./account-delivery-form";
import { AccountDebtIncrease } from "./account-debt-increase";
import { AccountCollectionMenu } from "./account-collection-menu";
import { StatusToast } from "./status-toast";
import { Pagination } from "./pagination";
import { AccountAllocationSummary } from "./account-allocation-summary";
import {
  dueSaleSelection,
  paymentAllocationSummary,
} from "./lib/account-payment-allocation";
import {
  ChevronDown,
  ReceiptText,
  CheckCheck,
  TrendingUp,
  Printer,
  Search,
  Eraser,
} from "lucide-react";
import {
  selectPendingItems,
  adjustedPendingItems,
  pendingSelectionState,
} from "./lib/account-selection";
import {
  getAccountItems,
  increaseAccountTotalDebt,
  previewAccountPrices,
  updateAccountPrices,
  type AccountItems,
  type ItemAllocation,
} from "./lib/api";
const money = (value: number | string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
function SaleCheckbox({
  checked,
  partial,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  partial: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 shrink-0 accent-teal-700"
    />
  );
}
export function AccountItemSelector({
  initialSaleId,
  onInitialSaleHandled,
  saleScope,
  summaryTarget,
  onStatement,
  menuTarget,
  onUpdated,
  token,
  organizationId,
  branchId,
  customerId,
  disabled,
  onChange,
}: {
  menuTarget: HTMLElement | null;
  summaryTarget?: HTMLElement | null;
  initialSaleId?: string;
  onInitialSaleHandled?: () => void;
  saleScope?: string;
  onStatement?: () => void;
  token: string;
  onUpdated: () => Promise<void>;
  organizationId: string;
  branchId: string;
  customerId: string;
  disabled: boolean;
  onChange: (
    allocations: ItemAllocation[],
    movementId: string,
    valid: boolean,
  ) => void;
}) {
  const [sourceData, setData] = useState<AccountItems>();
  const data = useMemo(
    () => (sourceData ? scopeAccountItems(sourceData, saleScope) : undefined),
    [sourceData, saleScope],
  );
  const [failure, setFailure] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const requestedSale = useRef(initialSaleId);
  const initialSaleHandled = useRef(false);
  const initialSaleCallback = useRef(onInitialSaleHandled);
  initialSaleCallback.current = onInitialSaleHandled;
  const salesContainer = useRef<HTMLDivElement>(null);
  const revealedRequestedSale = useRef(false);
  const [mode, setMode] = useState("");
  const [salePagination, setSalePagination] = useState({ mode: "", page: 1 });
  const [saleSearch, setSaleSearch] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [confirmAmount, setConfirmAmount] = useState<{
    id: string;
    name: string;
    before: number;
    after: number;
    value: string;
  }>();
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [totalIncreaseOpen, setTotalIncreaseOpen] = useState(false);
  const [adjustedAmounts, setAdjustedAmounts] = useState<
    Record<string, string>
  >({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const priceRequests = useRef(new Map<string, string>());
  const [priceMessage, setPriceMessage] = useState("");
  const [updating, setUpdating] = useState(false);
  const [priceError, setPriceError] = useState("");
  const priceLock = useRef(false);
  const inspectPrices = async (saleId: string) => {
    if (priceLock.current || disabled) return;
    priceLock.current = true;
    setUpdating(true);
    setPriceError("");
    setPriceMessage("");
    let applied = false;
    try {
      const preview = await previewAccountPrices(
        token,
        organizationId,
        branchId,
        customerId,
        saleId,
      );
      if (BigInt(preview.increaseMinor) > 0n) {
        const key = `${customerId}:${saleId}:${preview.fingerprint}`;
        let operationId = priceRequests.current.get(key);
        if (!operationId) {
          operationId = crypto.randomUUID();
          priceRequests.current.set(key, operationId);
        }
        await updateAccountPrices(
          token,
          organizationId,
          branchId,
          customerId,
          saleId,
          preview.fingerprint,
          operationId,
        );
        applied = true;
      }
      setChosen({});
      setAmountDrafts({});
      setAdjustedAmounts({});
      setDeliveryOpen(false);
      setData(
        await getAccountItems(token, organizationId, branchId, customerId),
      );
      await onUpdated();
      setPriceMessage(
        applied
          ? `Precios actualizados. Aumento aplicado: ${money(preview.increaseMinor)}.`
          : "Los precios ya están actualizados.",
      );
    } catch (cause) {
      setPriceError(
        applied
          ? "El ajuste se registró, pero no se pudo actualizar la vista. Volvé a abrir la cuenta."
          : cause instanceof Error
            ? cause.message
            : "No se pudo actualizar la deuda.",
      );
    } finally {
      setUpdating(false);
      priceLock.current = false;
    }
  };
  useEffect(() => {
    let active = true;
    void getAccountItems(token, organizationId, branchId, customerId)
      .then((result) => {
        const initialSaleId = requestedSale.current;
        if (active) {
          setData(result);
          if (initialSaleId && !initialSaleHandled.current) {
            initialSaleHandled.current = true;
            const selection = dueSaleSelection(
              scopeAccountItems(result, saleScope),
              initialSaleId,
            );
            if (selection) {
              setChosen(selection.chosen);
              setSalePagination({ mode: "", page: selection.page });
              setExpanded({ [initialSaleId]: true });
            } else
              setSelectionNotice(
                "Esta venta ya no tiene saldo seleccionable o necesita conciliación. Revisá los datos antes de cobrar.",
              );
            initialSaleCallback.current?.();
          }
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setFailure(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el detalle.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, branchId, customerId, saleScope]);
  const mixed = data?.mixedSales.find((sale) => sale.movementId === mode);
  const receipt = data?.unassignedReceipts.find((item) => item.id === mode);
  const rows = mixed
    ? mixed.items.map((item) => ({
        ...item,
        saleId: mixed.saleId,
        financedMinor: item.subtotalMinor,
        pendingMinor: item.subtotalMinor,
        paidMinor: "0",
        createdAt: null,
        previousPriceMinor: "0",
        referencePriceMinor: null,
        referenceCheckedAt: null,
        increaseMinor: "0",
      }))
    : (data?.items ?? []);
  const required = mixed
    ? Number(mixed.financedMinor)
    : receipt
      ? Number(receipt.amountMinor)
      : null;
  const groups = Array.from(new Set(rows.map((item) => item.saleId)))
    .map((saleId) => ({
      saleId,
      items: rows.filter((item) => item.saleId === saleId),
    }))
    .filter((group) =>
      group.items.some((item) => Number(item.pendingMinor) > 0),
    );
  const blocked = !mode && Boolean(data?.unassignedReceipts.length);
  const visibleGroups = filterPendingSales(groups, saleSearch);
  const salePages = Math.max(1, Math.ceil(visibleGroups.length / 5));
  const salePage = Math.min(
    salePagination.mode === mode ? salePagination.page : 1,
    salePages,
  );
  useLayoutEffect(() => {
    if (!data || !requestedSale.current || revealedRequestedSale.current)
      return;
    const container = salesContainer.current;
    const sale =
      container &&
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-sale-id]"),
      ).find((element) => element.dataset.saleId === requestedSale.current);
    if (!container || !sale) return;
    scrollSaleIntoView(container, sale);
    revealedRequestedSale.current = true;
  }, [data, salePage]);
  const allocations = useMemo(
    () =>
      accountCollectionAllocations(
        data?.items ?? [],
        chosen,
        adjustedAmounts,
        Boolean(mode),
      ),
    [data, chosen, adjustedAmounts, mode],
  );
  const total = allocations.reduce((sum, item) => sum + item.amountMinor, 0);
  const valid =
    Boolean(data) &&
    !confirmAmount &&
    !Object.entries(amountDrafts).some(
      ([id, value]) =>
        chosen[id] !== undefined &&
        value !==
          (adjustedAmounts[id] ??
            String(
              Number(
                rows.find((row) => row.saleItemId === id)?.pendingMinor ?? 0,
              ) / 100,
            )),
    ) &&
    !blocked &&
    !deliveryOpen &&
    !totalIncreaseOpen &&
    !updating &&
    allocations.length > 0 &&
    allocations.every(
      (item) =>
        Number.isSafeInteger(item.amountMinor) &&
        item.amountMinor > 0 &&
        item.amountMinor <=
          (item.nextPendingMinor ??
            Number(
              rows.find((row) => row.saleItemId === item.saleItemId)
                ?.pendingMinor ?? 0,
            )),
    ) &&
    (required === null
      ? total <=
        Number(data?.balanceMinor ?? 0) +
          allocations.reduce(
            (sum, item) =>
              sum +
              (item.expectedPendingMinor !== undefined
                ? (item.nextPendingMinor ?? item.amountMinor) -
                  item.expectedPendingMinor
                : 0),
            0,
          )
      : total === required);
  useEffect(() => {
    onChange(allocations, mode, valid);
  }, [allocations, mode, valid, onChange]);
  if (failure)
    return (
      <p role="alert" className="mt-3 text-sm text-rose-600">
        {failure}
      </p>
    );
  if (!data)
    return <p className="mt-3 text-sm text-slate-500">Cargando artículos...</p>;
  return (
    <>
      {confirmAmount && (
        <AccountAmountConfirmation
          name={confirmAmount.name}
          before={confirmAmount.before}
          after={confirmAmount.after}
          disabled={disabled || updating}
          onCancel={() => setConfirmAmount(undefined)}
          onConfirm={() => {
            if (
              disabled ||
              updating ||
              chosen[confirmAmount.id] === undefined ||
              amountDrafts[confirmAmount.id] !== confirmAmount.value
            )
              return;
            setAdjustedAmounts((current) => ({
              ...current,
              [confirmAmount.id]: confirmAmount.value,
            }));
            setChosen((current) => ({
              ...current,
              [confirmAmount.id]: String(
                (Math.round(Number(current[confirmAmount.id]) * 100) ===
                confirmAmount.before
                  ? confirmAmount.after
                  : Math.min(
                      Math.round(Number(current[confirmAmount.id]) * 100),
                      confirmAmount.after,
                    )) / 100,
              ),
            }));
            setAmountDrafts((current) => {
              const next = { ...current };
              delete next[confirmAmount.id];
              return next;
            });
            setConfirmAmount(undefined);
          }}
        />
      )}
      {summaryTarget &&
        !mode &&
        valid &&
        createPortal(
          <AccountAllocationSummary
            rows={paymentAllocationSummary(
              data.items.map((item) => ({
                ...item,
                pendingMinor: String(
                  accountPendingPreview(
                    item.pendingMinor,
                    adjustedAmounts[item.saleItemId],
                    !mode,
                  ),
                ),
              })),
              chosen,
            )}
          />,
          summaryTarget,
        )}
      {selectionNotice && (
        <p
          role="status"
          className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800"
        >
          {selectionNotice}
        </p>
      )}
      {totalIncreaseOpen && (
        <AccountDebtIncrease
          total
          name="Aumentar saldo total"
          pendingMinor={data.balanceMinor}
          disabled={disabled}
          onCancel={() => setTotalIncreaseOpen(false)}
          onSave={async (input) => {
            await increaseAccountTotalDebt(
              token,
              organizationId,
              branchId,
              customerId,
              {
                ...input,
                expectedItems: data.items
                  .filter((item) => BigInt(item.pendingMinor) > 0n)
                  .map((item) => ({
                    saleItemId: item.saleItemId,
                    pendingMinor: item.pendingMinor,
                  })),
              },
            );
            setChosen({});
            setAmountDrafts({});
            setAdjustedAmounts({});
            setTotalIncreaseOpen(false);
            setData(undefined);
            try {
              await onUpdated();
              setData(
                await getAccountItems(
                  token,
                  organizationId,
                  branchId,
                  customerId,
                ),
              );
            } catch {
              setFailure(
                "El aumento se registró, pero no se pudo actualizar la vista. Volvé a abrir la cuenta.",
              );
            }
          }}
        />
      )}
      {priceMessage && (
        <StatusToast
          message={priceMessage}
          onClose={() => setPriceMessage("")}
        />
      )}
      <fieldset
        disabled={disabled || updating}
        className="account-sale-selection min-w-0 space-y-3"
      >
        {updating && (
          <p role="status" className="sr-only">
            Actualizando precios…
          </p>
        )}
        {priceError && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700"
          >
            {priceError}
          </p>
        )}
        {(data.mixedSales.length > 0 || data.unassignedReceipts.length > 0) && (
          <label className="block text-xs font-medium text-slate-500">
            Conciliación de movimientos anteriores
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value);
                setChosen({});
                setAmountDrafts({});
                setAdjustedAmounts({});
                setDeliveryOpen(false);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
            >
              <option value="">Nuevo cobro por artículos</option>
              {data.mixedSales.map((sale) => (
                <option key={sale.movementId} value={sale.movementId}>
                  Definir pendiente inicial · Compra{" "}
                  {sale.saleId.slice(0, 8).toUpperCase()} ·{" "}
                  {money(sale.financedMinor)}
                </option>
              ))}
              {data.unassignedReceipts.map((item) => (
                <option key={item.id} value={item.id}>
                  Asignar cobro anterior ·{" "}
                  {new Date(item.createdAt).toLocaleDateString("es-AR")} ·{" "}
                  {money(item.amountMinor)}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode && (
          <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
            {mixed
              ? "Indicá cuánto quedó a cuenta corriente en cada artículo de esta compra."
              : "Indicá qué artículos se pagaron con este cobro anterior."}{" "}
            Debés asignar exactamente {money(required ?? 0)}. No se modifica el
            saldo ni se registra otro ingreso en caja.
          </p>
        )}
        {blocked && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Hay cobros anteriores sin artículos asignados. Seleccionalos arriba
            para conciliarlos antes de registrar otro cobro.
          </p>
        )}
        {!mode && data.mixedSales.length > 0 && (
          <p className="text-xs text-amber-700">
            Hay compras con pagos combinados: definí arriba qué artículos
            quedaron pendientes para incluirlas en este listado.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Ventas pendientes{" "}
              <span className="ml-1 text-slate-400">({groups.length})</span>
            </h3>
          </div>
          <label className="relative min-w-40 flex-1 sm:max-w-60">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              aria-label="Buscar venta pendiente por número"
              placeholder="Buscar venta…"
              value={saleSearch}
              onChange={(event) => {
                setSaleSearch(event.target.value);
                setSalePagination({ mode, page: 1 });
              }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
          {!mode && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {onStatement && (
                <button
                  type="button"
                  onClick={onStatement}
                  className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <Printer size={15} /> Resumen de cuenta
                </button>
              )}
              <button
                type="button"
                disabled={
                  blocked ||
                  !groups.length ||
                  rows.reduce(
                    (sum, item) => sum + Number(item.pendingMinor),
                    0,
                  ) !== Number(data.balanceMinor)
                }
                title="Selecciona todas las ventas pendientes, incluso las ocultas por la búsqueda; el cobro se registra al confirmar."
                onClick={() => {
                  setDeliveryOpen(false);

                  setSelectionNotice("");
                  setAmountDrafts({});
                  setChosen(
                    selectPendingItems(
                      {},
                      adjustedPendingItems(rows, adjustedAmounts, !mode),
                      true,
                    ),
                  );
                }}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-50 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-40"
              >
                <CheckCheck size={15} /> Pagar todo
              </button>
              {menuTarget &&
                createPortal(
                  <AccountCollectionMenu
                    disabled={disabled || updating}
                    unavailable={
                      blocked ||
                      !groups.length ||
                      data.mixedSales.length > 0 ||
                      rows.reduce(
                        (sum, item) => sum + Number(item.pendingMinor),
                        0,
                      ) !== Number(data.balanceMinor)
                    }
                    onDelivery={() => setDeliveryOpen(true)}
                    onIncrease={
                      saleScope
                        ? undefined
                        : () => {
                            setDeliveryOpen(false);
                            setTotalIncreaseOpen(true);
                          }
                    }
                    onPrices={
                      !blocked &&
                      rows.some((item) => Number(item.increaseMinor) > 0)
                        ? () => void inspectPrices(saleScope ?? "all")
                        : undefined
                    }
                  />,
                  menuTarget,
                )}
            </div>
          )}
        </div>
        {deliveryOpen && !mode && (
          <AccountDeliveryForm
            data={data}
            replacesSelection={Object.keys(chosen).length > 0}
            onCancel={() => setDeliveryOpen(false)}
            onPrepared={(next) => {
              setSaleSearch("");
              setSelectionNotice("");
              setAmountDrafts({});
              setAdjustedAmounts({});
              setChosen(next);
              setDeliveryOpen(false);
              const first = rows.find(
                (item) => next[item.saleItemId] !== undefined,
              );
              if (first) {
                setExpanded({ [first.saleId]: true });
                const index = groups.findIndex(
                  (group) => group.saleId === first.saleId,
                );
                setSalePagination({
                  mode: "",
                  page: Math.floor(Math.max(0, index) / 5) + 1,
                });
              }
            }}
          />
        )}
        <div
          ref={salesContainer}
          className="max-h-[42vh] space-y-2 overflow-y-auto pr-1"
        >
          {visibleGroups
            .slice((salePage - 1) * 5, salePage * 5)
            .map((group) => {
              const selectionItems = adjustedPendingItems(
                group.items,
                adjustedAmounts,
                !mode,
              );
              const selection = pendingSelectionState(chosen, selectionItems);
              const pending = group.items.reduce(
                (sum, item) =>
                  sum +
                  accountPendingPreview(
                    item.pendingMinor,
                    adjustedAmounts[item.saleItemId],
                    !mode,
                  ),
                0,
              );
              const remaining =
                pending -
                group.items.reduce(
                  (sum, item) =>
                    sum +
                    Math.round(Number(chosen[item.saleItemId] ?? 0) * 100),
                  0,
                );
              const date = group.items[0]?.createdAt;
              const applied = group.items.reduce(
                (sum, item) =>
                  sum + Math.round(Number(chosen[item.saleItemId] ?? 0) * 100),
                0,
              );
              const open = Boolean(expanded[group.saleId]);
              return (
                <div
                  key={group.saleId}
                  data-sale-id={group.saleId}
                  className={`overflow-hidden rounded-xl border ${selection.checked || selection.partial ? "border-teal-300" : "border-slate-200"}`}
                >
                  <div
                    className={`flex items-center gap-3 px-3 py-3 ${selection.checked || selection.partial ? "bg-teal-50/60" : "bg-white"}`}
                  >
                    <SaleCheckbox
                      label={`Pagar venta ${group.saleId.slice(0, 8).toUpperCase()}`}
                      checked={selection.checked}
                      partial={selection.partial}
                      disabled={blocked}
                      onChange={(checked) => {
                        setAmountDrafts((current) => {
                          const next = { ...current };
                          for (const item of group.items)
                            delete next[item.saleItemId];
                          return next;
                        });
                        setChosen((current) =>
                          selectPendingItems(current, selectionItems, checked),
                        );
                      }}
                    />
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() =>
                        setExpanded((current) => ({
                          ...current,
                          [group.saleId]: !open,
                        }))
                      }
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="hidden rounded-lg bg-slate-100 p-2 text-slate-500 sm:block">
                        <ReceiptText size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm text-slate-800">
                          Venta {group.saleId.slice(0, 8).toUpperCase()}
                        </strong>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {date
                            ? new Date(date).toLocaleDateString("es-AR") + " · "
                            : ""}
                          {group.items.length} artículos
                          {group.items.some(
                            (item) => Number(item.paidMinor) > 0,
                          ) && (
                            <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                              Con cobros aplicados
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    {!mode &&
                      !blocked &&
                      group.items.some(
                        (item) => Number(item.increaseMinor) > 0,
                      ) && (
                        <button
                          type="button"
                          onClick={() => void inspectPrices(group.saleId)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                        >
                          <TrendingUp size={13} />
                          Actualizar precios
                        </button>
                      )}
                    <span className="text-right">
                      <span className="block text-[10px] text-slate-400">
                        Pendiente
                      </span>
                      <strong className="whitespace-nowrap text-sm text-teal-700">
                        {money(pending)}
                      </strong>
                      {Number.isSafeInteger(applied) &&
                        applied > 0 &&
                        remaining >= 0 && (
                          <span className="mt-0.5 block whitespace-nowrap text-[11px] font-medium text-teal-700">
                            A cobrar {money(applied)}
                            <span className="block text-slate-500">
                              Queda {money(remaining)}
                            </span>
                          </span>
                        )}
                    </span>
                    <button
                      type="button"
                      aria-label="Desplegar artículos"
                      aria-expanded={open}
                      onClick={() =>
                        setExpanded((current) => ({
                          ...current,
                          [group.saleId]: !open,
                        }))
                      }
                    >
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  {open && (
                    <div className="overflow-x-auto border-t border-slate-100 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Artículo</th>
                            <th className="px-3 py-2 text-right">
                              Saldo pendiente
                            </th>
                            {!mode && (
                              <th className="px-3 py-2 text-right">
                                Ajustar saldo ($)
                              </th>
                            )}
                            <th className="px-3 py-2 text-right">
                              {mode ? "Asignar ($)" : "Abonar ahora ($)"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr
                              key={item.saleItemId}
                              className="border-t border-slate-100"
                            >
                              <td className="px-3 py-2">
                                <label className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    disabled={
                                      blocked || Number(item.pendingMinor) <= 0
                                    }
                                    checked={
                                      chosen[item.saleItemId] !== undefined
                                    }
                                    onChange={(event) => {
                                      setAmountDrafts((current) => {
                                        const next = { ...current };
                                        delete next[item.saleItemId];
                                        return next;
                                      });
                                      setChosen((current) =>
                                        selectPendingItems(
                                          current,
                                          adjustedPendingItems(
                                            [item],
                                            adjustedAmounts,
                                            !mode,
                                          ),
                                          event.target.checked,
                                        ),
                                      );
                                    }}
                                    className="mt-1 h-4 w-4 shrink-0 accent-teal-700"
                                  />
                                  <span className="text-sm text-slate-700">
                                    {item.name}
                                    {Number(item.increaseMinor) > 0 && (
                                      <span className="mt-1 block text-[11px] font-medium text-amber-700">
                                        Referencia aumentó:{" "}
                                        {money(item.previousPriceMinor)} →{" "}
                                        {money(item.referencePriceMinor ?? "0")}{" "}
                                        · Ajuste pendiente +
                                        {money(item.increaseMinor)}
                                        {item.referenceCheckedAt
                                          ? ` · Consultado ${new Date(item.referenceCheckedAt).toLocaleDateString("es-AR")}`
                                          : ""}
                                      </span>
                                    )}
                                    <span className="block text-[11px] text-slate-400">
                                      {item.quantity} un. ·{" "}
                                      {Number(item.pendingMinor) === 0
                                        ? "Pagado"
                                        : Number(item.paidMinor) > 0
                                          ? "Pago parcial"
                                          : "Pendiente"}
                                    </span>
                                    {Number(item.paidMinor) > 0 && (
                                      <span className="mt-1 block text-[11px] text-slate-500">
                                        Importe a cuenta:{" "}
                                        {money(
                                          Number(item.paidMinor) +
                                            accountPendingPreview(
                                              item.pendingMinor,
                                              adjustedAmounts[item.saleItemId],
                                              !mode,
                                            ),
                                        )}{" "}
                                        · Cobros aplicados:{" "}
                                        {money(item.paidMinor)}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                                <span
                                  title={`Saldo guardado: ${money(item.pendingMinor)}`}
                                >
                                  {money(
                                    accountPendingPreview(
                                      item.pendingMinor,
                                      adjustedAmounts[item.saleItemId],
                                      !mode,
                                    ),
                                  )}
                                </span>
                              </td>
                              {!mode && (
                                <td className="px-3 py-2 text-right">
                                  <input
                                    aria-label={`Nuevo saldo para ${item.name}`}
                                    disabled={
                                      chosen[item.saleItemId] === undefined ||
                                      blocked
                                    }
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    max={
                                      mode
                                        ? Number(item.pendingMinor) / 100
                                        : undefined
                                    }
                                    value={
                                      chosen[item.saleItemId] === undefined
                                        ? ""
                                        : (amountDrafts[item.saleItemId] ??
                                          adjustedAmounts[item.saleItemId] ??
                                          String(
                                            Number(item.pendingMinor) / 100,
                                          ))
                                    }
                                    onChange={(event) =>
                                      setAmountDrafts((current) => ({
                                        ...current,
                                        [item.saleItemId]: event.target.value,
                                      }))
                                    }
                                    className="w-24 rounded-lg border border-slate-200 p-2 text-right text-sm focus:border-teal-500 focus:outline-none disabled:bg-slate-50"
                                  />
                                  {!mode &&
                                    chosen[item.saleItemId] !== undefined &&
                                    amountDrafts[item.saleItemId] !==
                                      undefined &&
                                    amountDrafts[item.saleItemId] !==
                                      (adjustedAmounts[item.saleItemId] ??
                                        String(
                                          Number(item.pendingMinor) / 100,
                                        )) && (
                                      <div className="mt-1 flex justify-end gap-2 text-[11px]">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAmountDrafts((current) => {
                                              const next = { ...current };
                                              delete next[item.saleItemId];
                                              return next;
                                            })
                                          }
                                          className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100"
                                        >
                                          Deshacer
                                        </button>
                                        <button
                                          type="button"
                                          disabled={
                                            !Number.isSafeInteger(
                                              Math.round(
                                                Number(
                                                  amountDrafts[item.saleItemId],
                                                ) * 100,
                                              ),
                                            ) ||
                                            Number(
                                              amountDrafts[item.saleItemId],
                                            ) <= 0
                                          }
                                          onClick={() =>
                                            setConfirmAmount({
                                              id: item.saleItemId,
                                              name: item.name,
                                              before: Math.round(
                                                Number(
                                                  adjustedAmounts[
                                                    item.saleItemId
                                                  ] ??
                                                    String(
                                                      Number(
                                                        item.pendingMinor,
                                                      ) / 100,
                                                    ),
                                                ) * 100,
                                              ),
                                              after: Math.round(
                                                Number(
                                                  amountDrafts[item.saleItemId],
                                                ) * 100,
                                              ),
                                              value:
                                                amountDrafts[item.saleItemId]!,
                                            })
                                          }
                                          className="rounded-md bg-teal-50 px-2 py-1 font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-40"
                                        >
                                          Aplicar
                                        </button>
                                      </div>
                                    )}
                                </td>
                              )}
                              <td className="px-3 py-2 text-right">
                                <input
                                  aria-label={`Abonar ahora para ${item.name}`}
                                  type="number"
                                  min="0.01"
                                  step="any"
                                  disabled={
                                    chosen[item.saleItemId] === undefined ||
                                    blocked
                                  }
                                  max={
                                    accountPendingPreview(
                                      item.pendingMinor,
                                      adjustedAmounts[item.saleItemId],
                                      !mode,
                                    ) / 100
                                  }
                                  value={chosen[item.saleItemId] ?? ""}
                                  onChange={(event) =>
                                    setChosen((current) => ({
                                      ...current,
                                      [item.saleItemId]: event.target.value,
                                    }))
                                  }
                                  className="w-24 rounded-lg border border-teal-200 bg-teal-50/30 p-2 text-right text-sm focus:border-teal-500 focus:outline-none disabled:bg-slate-50"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          {!visibleGroups.length && (
            <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              {saleSearch.trim()
                ? "No hay ventas que coincidan con la búsqueda."
                : "No hay ventas pendientes para esta selección."}
            </p>
          )}
        </div>
        {Object.keys(chosen).length > 0 && (
          <button
            type="button"
            onClick={() => {
              setChosen({});
              setAmountDrafts({});
            }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            <Eraser size={15} aria-hidden="true" />
            Limpiar selección
          </button>
        )}
        {visibleGroups.length > 0 && (
          <Pagination
            compact
            pageSize={5}
            total={visibleGroups.length}
            currentPage={salePage}
            totalPages={salePages}
            noun="ventas"
            label="Páginas de ventas pendientes"
            onChange={(page) => setSalePagination({ mode, page })}
          />
        )}
      </fieldset>
    </>
  );
}
