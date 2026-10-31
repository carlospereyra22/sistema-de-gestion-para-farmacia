import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { UserRound, FileText, Phone, ChevronDown, X, Save } from "lucide-react";
import {
  createParty,
  updateCustomerBilling,
  type CustomerBilling,
  type Party,
} from "./lib/api";
import { CustomerNameWarning } from "./customer-name-warning";
import { normalizedCustomerName } from "./lib/customer-identity";
import { ProductFilterSelect } from "./product-filter-select";
import { field, primary, secondary } from "./supplier-payables/dialog";

const conditions = [
  "Consumidor final",
  "Responsable inscripto",
  "Monotributista",
  "Exento",
  "Otra condición",
];
const keys: (keyof CustomerBilling)[] = [
  "billingName",
  "billingTaxId",
  "billingVatCondition",
  "billingAddress",
  "billingCity",
  "billingProvince",
  "billingPostalCode",
  "billingPhone",
  "billingEmail",
  "notes",
];

function Section({
  title,
  icon,
  children,
  open = true,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="group rounded-xl border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
        <span className="text-teal-700">{icon}</span>
        {title}
        <ChevronDown
          size={15}
          className="ml-auto text-slate-400 group-open:rotate-180"
        />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
export function CustomerEditor({
  customer,
  customers,
  priceLists,
  token,
  organizationId,
  onClose,
  onSaved,
}: {
  customer?: Party;
  customers: Party[];
  priceLists: { id: string; name: string }[];
  token: string;
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    gate = useRef(false),
    titleId = useId();
  const [name, setName] = useState(customer?.name ?? ""),
    [listId, setListId] = useState(customer?.priceListId ?? "");
  const [value, setValue] = useState<CustomerBilling>(() =>
    Object.fromEntries(keys.map((key) => [key, customer?.[key] ?? ""])),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current,
      previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  const general = priceLists.find((p) => p.name === "Precio general");
  const options = [
    { value: general?.id === listId ? listId : "", label: "Precio general" },
    ...priceLists
      .filter((p) => p.name !== "Precio general")
      .map((p) => ({ value: p.id, label: p.name })),
    ...(listId && !priceLists.some((p) => p.id === listId)
      ? [{ value: listId, label: "Lista asignada" }]
      : []),
  ];
  const input = (
    key: keyof CustomerBilling,
    label: string,
    max: number,
    type = "text",
    placeholder?: string,
  ) => (
    <label className="block text-xs text-slate-500">
      {label}
      <input
        className={`${field} mt-1`}
        type={type}
        maxLength={max}
        placeholder={placeholder}
        value={value[key] ?? ""}
        onChange={(e) => setValue({ ...value, [key]: e.target.value })}
      />
    </label>
  );
  const submit = async () => {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      if (customer)
        await updateCustomerBilling(token, organizationId, customer.id, {
          ...value,
          ...(name !== customer.name ? { name: name.trim() } : {}),
          ...(listId !== (customer.priceListId ?? "")
            ? { priceListId: listId || null }
            : {}),
        });
      else
        await createParty(
          token,
          organizationId,
          "customers",
          name.trim(),
          "",
          listId || undefined,
          value,
        );
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el cliente.",
      );
    } finally {
      gate.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!gate.current) onClose();
      }}
      className="m-auto w-[min(760px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/35"
    >
      <form
        className="flex max-h-[90dvh] flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
            <UserRound size={21} />
          </span>
          <div>
            <h2 id={titleId} className="font-semibold">
              {customer ? "Editar cliente" : "Nuevo cliente"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Datos de la ficha y condiciones comerciales.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar ventana"
            disabled={busy}
            onClick={onClose}
            className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-50"
          >
            <X size={19} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">
          <fieldset disabled={busy} className="space-y-4">
            <section className="rounded-xl border border-slate-200 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <UserRound size={17} className="text-teal-700" />
                Datos principales
              </h3>
              <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
                <label className="text-xs text-slate-500">
                  Nombre o razón social <span className="text-rose-500">*</span>
                  <input
                    autoFocus
                    required
                    minLength={2}
                    maxLength={160}
                    className={`${field} mt-1`}
                    value={name}
                    placeholder="Ej. Juan Pérez / Farmacia del Sol"
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="text-xs text-slate-500">
                  <p className="mb-1">Lista de precios</p>
                  <ProductFilterSelect
                    compact
                    label="Lista de precios"
                    value={listId}
                    options={options}
                    icon={null}
                    onChange={setListId}
                  />
                </div>
              </div>
              {(!customer ||
                normalizedCustomerName(name) !==
                  normalizedCustomerName(customer.name)) && (
                <CustomerNameWarning
                  customers={customers}
                  name={name}
                  excludeId={customer?.id}
                />
              )}
            </section>
            <Section title="Datos de facturación" icon={<FileText size={17} />}>
              <div className="grid gap-3 sm:grid-cols-2">
                {input(
                  "billingTaxId",
                  "CUIT / CUIL / DNI",
                  32,
                  "text",
                  "Sin especificar",
                )}
                <div className="text-xs text-slate-500">
                  <p className="mb-1">Condición frente al IVA</p>
                  <ProductFilterSelect
                    compact
                    label="Condición frente al IVA"
                    value={value.billingVatCondition ?? ""}
                    icon={null}
                    options={[
                      { value: "", label: "Sin especificar" },
                      ...conditions.map((label) => ({ value: label, label })),
                      ...(value.billingVatCondition &&
                      !conditions.includes(value.billingVatCondition)
                        ? [
                            {
                              value: value.billingVatCondition,
                              label: value.billingVatCondition,
                            },
                          ]
                        : []),
                    ]}
                    onChange={(billingVatCondition) =>
                      setValue({ ...value, billingVatCondition })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  {input(
                    "billingAddress",
                    "Domicilio de facturación",
                    200,
                    "text",
                    "Calle y número",
                  )}
                </div>
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
                  {input("billingCity", "Localidad", 100)}
                  {input("billingProvince", "Provincia", 100)}
                  {input("billingPostalCode", "Código postal", 20)}
                </div>
              </div>
            </Section>
            <Section
              title="Más datos"
              icon={<FileText size={17} />}
              open={false}
            >
              {input(
                "billingName",
                "Razón social para facturación (si es diferente)",
                160,
              )}
              {customer && (
                <p className="mt-3 text-xs text-slate-400">
                  Ficha {customer.id.slice(0, 8)}
                  {customer.document
                    ? ` · Documento registrado: ${customer.document}`
                    : ""}
                </p>
              )}
            </Section>
            <Section title="Contacto" icon={<Phone size={17} />}>
              <div className="grid gap-3 sm:grid-cols-2">
                {input("billingPhone", "Teléfono / WhatsApp", 40, "tel")}
                {input("billingEmail", "Email", 254, "email")}
                <label className="text-xs text-slate-500 sm:col-span-2">
                  Observaciones
                  <textarea
                    maxLength={1000}
                    className="mt-1 min-h-20 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-teal-500"
                    placeholder="Información adicional del cliente…"
                    value={value.notes ?? ""}
                    onChange={(e) =>
                      setValue({ ...value, notes: e.target.value })
                    }
                  />
                </label>
              </div>
            </Section>
          </fieldset>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
          <button
            type="button"
            className={secondary}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className={primary} disabled={busy}>
            <Save size={16} />
            {busy ? "Guardando…" : "Guardar cliente"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
