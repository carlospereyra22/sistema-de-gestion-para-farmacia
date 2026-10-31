import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CustomerNameWarning } from "./customer-name-warning";
import { normalizedCustomerName } from "./lib/customer-identity";
import {
  updateCustomerBilling,
  type CustomerBilling,
  type Party,
} from "./lib/api";

const fields: {
  key: keyof CustomerBilling;
  label: string;
  max: number;
  type?: string;
}[] = [
  { key: "billingTaxId", label: "CUIT / CUIL / DNI", max: 32 },
  { key: "billingVatCondition", label: "Condición frente al IVA", max: 80 },
  { key: "billingAddress", label: "Domicilio de facturación", max: 200 },
  { key: "billingCity", label: "Localidad", max: 100 },
  { key: "billingProvince", label: "Provincia", max: 100 },
  { key: "billingPostalCode", label: "Código postal", max: 20 },
  {
    key: "billingEmail",
    label: "Email",
    max: 254,
    type: "email",
  },
  { key: "billingPhone", label: "Teléfono de contacto", max: 40, type: "tel" },
];
export function CustomerBillingFields({
  value,
  onChange,
}: {
  value: CustomerBilling;
  onChange: (value: CustomerBilling) => void;
}) {
  const conditions = [
    "Consumidor final",
    "Responsable inscripto",
    "Monotributista",
    "Exento",
    "Otra condición",
  ];
  const condition = value.billingVatCondition ?? "";
  const renderField = (field: (typeof fields)[number]) => (
    <label key={field.key} className="block text-xs font-medium text-slate-600">
      {field.label}
      {field.key === "billingVatCondition" ? (
        <select
          value={condition}
          onChange={(event) =>
            onChange({ ...value, billingVatCondition: event.target.value })
          }
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">Sin especificar</option>
          {condition && !conditions.includes(condition) && (
            <option value={condition}>{condition}</option>
          )}
          {conditions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type ?? "text"}
          maxLength={field.max}
          value={value[field.key] ?? ""}
          onChange={(event) =>
            onChange({ ...value, [field.key]: event.target.value })
          }
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
        />
      )}
    </label>
  );
  return (
    <div className="grid gap-3">
      {fields.slice(0, 3).map(renderField)}
      <details className="border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-xs font-medium text-teal-700">
          Más datos
        </summary>
        <div className="mt-3 grid gap-3">
          {fields.slice(3, 6).map(renderField)}
        </div>
      </details>
    </div>
  );
}

export function CustomerContactFields({
  value,
  onChange,
}: {
  value: CustomerBilling;
  onChange: (value: CustomerBilling) => void;
}) {
  return (
    <details className="mt-4 rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-teal-700">
        Contacto{" "}
        <span className="text-xs font-normal text-slate-400">· Opcional</span>
      </summary>
      <div className="mt-3 grid gap-3">
        {fields.slice(6).map((field) => (
          <label
            key={field.key}
            className="block text-xs font-medium text-slate-600"
          >
            {field.label}
            <input
              type={field.type ?? "text"}
              maxLength={field.max}
              value={value[field.key] ?? ""}
              onChange={(event) =>
                onChange({ ...value, [field.key]: event.target.value })
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </label>
        ))}
      </div>
    </details>
  );
}
export function CustomerBillingDialog({
  customer,
  token,
  organizationId,
  onClose,
  onSaved,
  priceLists,
  customers = [],
}: {
  customer: Party;
  token: string;
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
  priceLists?: { id: string; name: string }[];
  customers?: Party[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(customer.name);
  const [priceListId, setPriceListId] = useState(customer.priceListId ?? "");
  const [value, setValue] = useState<CustomerBilling>(() =>
    Object.fromEntries(
      fields.map((field) => [field.key, customer[field.key] ?? ""]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="billing-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/35 backdrop:backdrop-blur-sm"
    >
      <form
        className="flex max-h-[85dvh] flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          void updateCustomerBilling(token, organizationId, customer.id, {
            ...(priceLists && priceListId !== (customer.priceListId ?? "")
              ? { priceListId: priceListId || null }
              : {}),
            ...value,
            ...(name !== customer.name ? { name } : {}),
          })
            .then(() => {
              onSaved();
              onClose();
            })
            .catch((cause: unknown) =>
              setError(
                cause instanceof Error ? cause.message : "No se pudo guardar.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-teal-50/60 p-5">
          <div>
            <h2 id="billing-title" className="text-lg font-semibold">
              {priceLists ? "Editar cliente" : "Datos de facturación"}
            </h2>
            <p className="text-sm text-slate-500">
              {customer.name} · Opcionales
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-lg p-2"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">
          <label className="mb-3 block text-xs font-medium text-slate-600">
            Nombre o razón social
            <input
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </label>
          <CustomerBillingFields value={value} onChange={setValue} />
          {normalizedCustomerName(name) !==
            normalizedCustomerName(customer.name) && (
            <CustomerNameWarning
              customers={customers}
              name={name}
              excludeId={customer.id}
            />
          )}
          {priceLists && (
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Lista de precios
              <select
                value={priceListId}
                onChange={(event) => setPriceListId(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
              >
                <CustomerPriceListOptions
                  priceListId={priceListId}
                  lists={priceLists}
                />
              </select>
            </label>
          )}
          <CustomerContactFields value={value} onChange={setValue} />
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white"
          >
            {busy ? "Guardando…" : "Guardar datos"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
import { CustomerPriceListOptions } from "./customer-price-list-options";
