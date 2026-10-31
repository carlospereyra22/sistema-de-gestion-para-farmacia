import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Link2,
  Plus,
  Save,
  Trash2,
  Clock3,
  ListOrdered,
  RotateCcw,
} from "lucide-react";
import { SearchableSaleSelect } from "../searchable-sale-select";
import { PurchaseExitDialog } from "../purchase-dialog-extras";
import {
  ars,
  documentLabels,
  inputMinor,
  purchaseAmountInput,
  payableRequest,
  PayableError,
  type InvoiceInput,
  type PayableOptions,
  type PayableScope,
} from "./api";
import { field, primary, secondary, PayableDialog } from "./dialog";
import { supplierInvoiceDue } from "./invoice-due";

type Draft = {
  dueEdited?: boolean;
  operationId: string;
  supplierId: string;
  purchaseId: string;
  documentType: string;
  pointOfSale: string;
  documentNumber: string;
  issuedOn: string;
  amount: string;
  reference: string;
  notes: string;
  mode: "date" | "none" | "split";
  dueOn: string;
  dues: { key: string; dueOn: string; amount: string }[];
  locked?: InvoiceInput;
};
function buildInvoice(draft: Draft): InvoiceInput {
  if (!draft.supplierId) throw new Error("Elegí un proveedor.");
  if (!draft.issuedOn) throw new Error("Indicá la fecha de emisión.");
  const amountMinor = inputMinor(draft.amount);
  const dues =
    draft.mode === "split"
      ? draft.dues.map((d) => ({
          dueOn: d.dueOn,
          amountMinor: inputMinor(d.amount),
        }))
      : [{ dueOn: draft.mode === "none" ? null : draft.dueOn, amountMinor }];
  if (dues.some((d) => d.dueOn === ""))
    throw new Error(
      "Completá los vencimientos o elegí Sin vencimiento definido.",
    );
  if (dues.some((d) => d.dueOn !== null && d.dueOn < draft.issuedOn))
    throw new Error("Los vencimientos no pueden ser anteriores a la emisión.");
  if (
    dues.reduce((sum, d) => sum + BigInt(d.amountMinor), 0n) !==
    BigInt(amountMinor)
  )
    throw new Error("La suma de los vencimientos debe coincidir con el total.");
  return {
    operationId: draft.operationId,
    supplierId: draft.supplierId,
    purchaseId: draft.purchaseId || undefined,
    documentType: draft.documentNumber.trim() ? draft.documentType : "OTRO",
    pointOfSale: draft.pointOfSale,
    documentNumber: draft.documentNumber,
    issuedOn: draft.issuedOn,
    amountMinor,
    reference: draft.reference,
    notes: draft.notes,
    dues,
  };
}
export function InvoiceEditor({
  scope,
  options,
  storageKey,
  initialPurchaseId,
  onClose,
  onSaved,
}: {
  scope: PayableScope;
  options: PayableOptions;
  storageKey: string;
  initialPurchaseId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (d.operationId && Array.isArray(d.dues))
          return d.locked || d.amount.trim()
            ? d
            : {
                ...d,
                amount: purchaseAmountInput(
                  options.purchases.find((p) => p.id === d.purchaseId)
                    ?.amountMinor,
                ),
              };
      }
    } catch {
      /* Un borrador ilegible no reemplaza datos confirmados. */
    }
    const purchase = options.purchases.find((p) => p.id === initialPurchaseId);
    return {
      operationId: crypto.randomUUID(),
      supplierId: purchase?.supplierId ?? "",
      purchaseId: purchase?.id ?? "",
      documentType: "OTRO",
      pointOfSale: "",
      documentNumber: "",
      issuedOn: options.today,
      amount: purchaseAmountInput(purchase?.amountMinor),
      reference: "",
      notes: "",
      ...supplierInvoiceDue(
        options.suppliers.find((s) => s.id === purchase?.supplierId),
        options.today,
      ),
      dueEdited: false,
      dues: [],
    };
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [exit, setExit] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setError(
        "El navegador no permite guardar el borrador. No se enviará la factura hasta poder conservar el identificador de la solicitud.",
      );
    }
  }, [draft, storageKey]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  const patch = (change: Partial<Draft>) => {
    if (!draft.locked) {
      setDraft((d) => ({ ...d, ...change }));
      setError("");
    }
  };
  const linked = options.purchases.find((p) => p.id === draft.purchaseId);
  const supplier = options.suppliers.find((s) => s.id === draft.supplierId);
  let entered: string | undefined;
  try {
    entered = inputMinor(draft.amount);
  } catch {
    /* importe todavía incompleto */
  }
  const splitTotal = draft.dues.reduce((sum, d) => {
    try {
      return sum + BigInt(inputMinor(d.amount));
    } catch {
      return sum;
    }
  }, 0n);
  const close = () => {
    if (!busy) setExit(true);
  };
  const submit = async () => {
    if (pending.current) return;
    try {
      const body = draft.locked ?? buildInvoice(draft);
      pending.current = true;
      setBusy(true);
      setError("");
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ ...draft, locked: body }),
      );
      setDraft((d) => ({ ...d, locked: body }));
      const result = await payableRequest<{ id: string }>(scope, "", body);
      sessionStorage.removeItem(storageKey);
      onSaved(result.id);
    } catch (e) {
      if (
        e instanceof PayableError &&
        (e.status === 400 ||
          e.status === 403 ||
          e.code === "DUPLICATE_DOCUMENT")
      )
        setDraft((d) => ({ ...d, locked: undefined }));
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
  return (
    <PayableDialog
      title="Registrar deuda de proveedor"
      onClose={exit ? () => setExit(false) : close}
      confirmation={
        exit && (
          <PurchaseExitDialog
            documentName="deuda"
            locked={Boolean(draft.locked)}
            onContinue={() => setExit(false)}
            onSave={onClose}
            onDiscard={() => {
              sessionStorage.removeItem(storageKey);
              onClose();
            }}
          />
        )
      }
    >
      <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
        Registrás una deuda administrativa. No modifica mercadería, precios ni
        Caja.
      </p>
      {initialPurchaseId && draft.purchaseId !== initialPurchaseId && (
        <p className="mb-3 text-sm text-amber-700">
          Recuperamos un borrador anterior. Terminá o descartalo antes de
          registrar otra factura.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {draft.locked && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Solicitud enviada. Si hubo una interrupción, reintentá los mismos
          datos para no duplicar la factura.
        </p>
      )}
      <fieldset disabled={busy || Boolean(draft.locked)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-500">
            Proveedor
            <SearchableSaleSelect
              label="Proveedor de la factura"
              value={draft.supplierId}
              floatingOptions
              options={options.suppliers.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
              onChange={(supplierId) =>
                patch({
                  supplierId,
                  purchaseId: "",
                  ...supplierInvoiceDue(
                    options.suppliers.find((s) => s.id === supplierId),
                    draft.issuedOn,
                  ),
                  dueEdited: false,
                })
              }
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Fecha de registro
            <input
              type="date"
              className={`${field} mt-1`}
              max={options.today}
              value={draft.issuedOn}
              onChange={(e) =>
                patch({
                  issuedOn: e.target.value,
                  ...(draft.dueEdited === false
                    ? supplierInvoiceDue(
                        options.suppliers.find(
                          (s) => s.id === draft.supplierId,
                        ),
                        e.target.value,
                      )
                    : {}),
                })
              }
            />
          </label>
        </div>
        <details className="rounded-lg border border-slate-100 p-3 text-xs text-slate-500">
          <summary className="cursor-pointer">
            Datos del comprobante (opcional)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-500">
              Tipo de comprobante
              <select
                className={`${field} mt-1`}
                value={draft.documentType}
                onChange={(e) => patch({ documentType: e.target.value })}
              >
                {Object.entries(documentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Punto de venta
              <input
                className={`${field} mt-1`}
                inputMode="numeric"
                maxLength={5}
                placeholder="0003"
                value={draft.pointOfSale}
                onChange={(e) => patch({ pointOfSale: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Número de comprobante
              <input
                className={`${field} mt-1`}
                maxLength={60}
                placeholder="00001245"
                value={draft.documentNumber}
                onChange={(e) => patch({ documentNumber: e.target.value })}
              />
            </label>
          </div>
        </details>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-500">
            Importe total a pagar (ARS)
            <input
              inputMode="decimal"
              className={`${field} mt-1 font-semibold text-teal-800`}
              placeholder="Ej. 500000,00"
              value={draft.amount}
              onChange={(e) => patch({ amount: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Compra relacionada <span className="font-normal">(opcional)</span>
            <select
              className={`${field} mt-1`}
              value={draft.purchaseId}
              disabled={!draft.supplierId}
              onChange={(e) =>
                patch({
                  purchaseId: e.target.value,
                  amount: purchaseAmountInput(
                    options.purchases.find((p) => p.id === e.target.value)
                      ?.amountMinor,
                  ),
                })
              }
            >
              <option value="">Sin compra relacionada</option>
              {options.purchases
                .filter((p) => p.supplierId === draft.supplierId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.reference || p.id.slice(0, 8).toUpperCase()} ·{" "}
                    {ars(p.amountMinor)}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {linked && (
          <p className="flex items-start gap-2 rounded-lg border border-teal-100 bg-teal-50/50 p-3 text-xs text-teal-800">
            <Link2 size={15} className="shrink-0" />
            <span>
              Estimado de la compra: <strong>{ars(linked.amountMinor)}</strong>.
              Podés ajustar el importe antes de registrar.
              {entered && entered !== linked.amountMinor && (
                <span className="mt-1 block text-amber-700">
                  Diferencia:{" "}
                  {ars(
                    (BigInt(entered) - BigInt(linked.amountMinor)).toString(),
                  )}
                  . No se cambiará el pedido.
                </span>
              )}
            </span>
          </p>
        )}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarDays size={16} className="text-teal-600" />
              Vencimiento
            </h3>
            {supplier?.accountEnabled && supplier.accountTermDays != null && (
              <button
                type="button"
                title="Usar el plazo del proveedor desde la fecha de registro"
                className="inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-100"
                onClick={() =>
                  patch({
                    ...supplierInvoiceDue(supplier, draft.issuedOn),
                    dueEdited: false,
                  })
                }
              >
                <RotateCcw size={12} /> Plazo del proveedor ·{" "}
                {supplier.accountTermDays} días
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: "date", label: "Una fecha", icon: CalendarDays },
                { id: "none", label: "Sin fecha", icon: Clock3 },
                { id: "split", label: "En cuotas", icon: ListOrdered },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={draft.mode === option.id}
                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 ${draft.mode === option.id ? "bg-white font-semibold text-teal-800 shadow-sm" : "text-slate-500 hover:bg-white/60"}`}
                onClick={() =>
                  patch({
                    mode: option.id,
                    dueEdited: true,
                    dues:
                      option.id === "split" && !draft.dues.length
                        ? [
                            {
                              key: crypto.randomUUID(),
                              dueOn: draft.dueOn,
                              amount: draft.amount,
                            },
                            { key: crypto.randomUUID(), dueOn: "", amount: "" },
                          ]
                        : draft.dues,
                  })
                }
              >
                <option.icon size={14} className="hidden shrink-0 sm:block" />
                {option.label}
              </button>
            ))}
          </div>
          {draft.mode === "date" && (
            <div className="mt-3 grid items-end gap-3 sm:grid-cols-[220px_1fr]">
              <label className="block text-xs text-slate-500">
                Fecha de vencimiento
                <input
                  type="date"
                  className={`${field} mt-1`}
                  min={draft.issuedOn}
                  value={draft.dueOn}
                  onChange={(e) =>
                    patch({ dueOn: e.target.value, dueEdited: true })
                  }
                />
              </label>
              <p className="pb-2 text-xs leading-relaxed text-slate-400">
                Una sola fecha para el total. Podés cambiar la sugerida por el
                proveedor.
              </p>
            </div>
          )}
          {draft.mode === "none" && (
            <p className="mt-3 text-xs text-slate-500">
              Quedará pendiente, sin alertas de atraso hasta contar con una
              fecha.
            </p>
          )}
          {draft.mode === "split" && (
            <div className="mt-3 space-y-2">
              {draft.dues.map((due, index) => (
                <div
                  key={due.key}
                  className="grid grid-cols-[20px_1fr_1fr_30px] items-end gap-2"
                >
                  <span className="pb-3 text-xs text-slate-400">
                    {index + 1}
                  </span>
                  <label className="text-xs text-slate-500">
                    Fecha
                    <input
                      type="date"
                      aria-label={`Fecha del vencimiento ${index + 1}`}
                      className={`${field} mt-1`}
                      min={draft.issuedOn}
                      value={due.dueOn}
                      onChange={(e) =>
                        patch({
                          dues: draft.dues.map((d) =>
                            d.key === due.key
                              ? { ...d, dueOn: e.target.value }
                              : d,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Importe (ARS)
                    <input
                      inputMode="decimal"
                      aria-label={`Importe del vencimiento ${index + 1}`}
                      className={`${field} mt-1`}
                      value={due.amount}
                      onChange={(e) =>
                        patch({
                          dues: draft.dues.map((d) =>
                            d.key === due.key
                              ? { ...d, amount: e.target.value }
                              : d,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Quitar vencimiento ${index + 1}`}
                    disabled={draft.dues.length <= 2}
                    className="pb-3 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                    onClick={() =>
                      patch({
                        dues: draft.dues.filter((d) => d.key !== due.key),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={draft.dues.length >= 36}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700"
                  onClick={() =>
                    patch({
                      dues: [
                        ...draft.dues,
                        { key: crypto.randomUUID(), dueOn: "", amount: "" },
                      ],
                    })
                  }
                >
                  <Plus size={14} />
                  Agregar vencimiento
                </button>
                <span
                  className={`text-xs ${entered && splitTotal === BigInt(entered) ? "text-teal-700" : "text-amber-700"}`}
                >
                  Asignado {ars(splitTotal.toString())}
                  {entered ? ` de ${ars(entered)}` : ""}
                </span>
              </div>
            </div>
          )}
        </section>
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">
            Referencia y observaciones{" "}
            <span className="text-xs">(opcional)</span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-500">
              Referencia
              <input
                className={`${field} mt-1`}
                maxLength={120}
                value={draft.reference}
                onChange={(e) => patch({ reference: e.target.value })}
              />
            </label>
            <label className="text-xs text-slate-500">
              Observaciones
              <input
                className={`${field} mt-1`}
                maxLength={1000}
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
          </div>
        </details>
      </fieldset>
      <footer className="sticky -bottom-5 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white py-4">
        <p className="text-xs text-slate-500">
          Se registra al confirmar. No emite una factura fiscal.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            className={secondary}
            onClick={close}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            className={primary}
            onClick={() => void submit()}
          >
            <Save size={16} />
            {busy
              ? "Guardando…"
              : draft.locked
                ? "Reintentar misma solicitud"
                : "Registrar deuda"}
          </button>
        </div>
      </footer>
    </PayableDialog>
  );
}
