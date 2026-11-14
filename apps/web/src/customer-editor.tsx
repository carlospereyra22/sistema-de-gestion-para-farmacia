import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  UserRound,
  FileText,
  Phone,
  ChevronDown,
  X,
  Save,
  Search,
} from "lucide-react";
import { TOKEN_SIN_CONEXION } from "./lib/cache-local";
import { useConectividad } from "./lib/conectividad";
import { BUSQUEDA_ARCA } from "./lib/funciones-ocultas";
import {
  buscarCuitEnArca,
  createParty,
  updateCustomerBilling,
  type CustomerBilling,
  type Party,
} from "./lib/api";
import {
  CustomerDocumentWarning,
  CustomerNameWarning,
} from "./customer-name-warning";
import {
  matchingCustomerDocuments,
  normalizedCustomerDocument,
  normalizedCustomerName,
  type CustomerIdentity,
} from "./lib/customer-identity";
import { normalizePhone } from "./lib/phone-number";
import { PhoneInput } from "./phone-input";
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
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-base font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
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
  initialName = "",
  priceLists,
  token,
  organizationId,
  branchId,
  onClose,
  onSaved,
}: {
  customer?: Party;
  customers: CustomerIdentity[];
  initialName?: string;
  priceLists: { id: string; name: string }[];
  token: string;
  organizationId: string;
  /** Sin conexión, el alta queda en la PC a nombre de esta sucursal (SISTEMA-70). */
  branchId?: string;
  onClose: () => void;
  onSaved: (customerId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    gate = useRef(false),
    titleId = useId();
  const [name, setName] = useState(customer?.name ?? initialName),
    [listId, setListId] = useState(customer?.priceListId ?? "");
  const [value, setValue] = useState<CustomerBilling>(() => ({
    ...Object.fromEntries(keys.map((key) => [key, customer?.[key] ?? ""])),
    billingPhone: normalizePhone(customer?.billingPhone),
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  // Buscar el CUIT en el padrón de ARCA (SISTEMA-70). Necesita internet.
  const { enLinea } = useConectividad();
  const puedeBuscar = enLinea && token !== TOKEN_SIN_CONEXION;
  const [buscando, setBuscando] = useState(false);
  const [arca, setArca] = useState<{ ok: boolean; mensaje: string }>();
  const buscarEnArca = async () => {
    if (buscando || !puedeBuscar) return;
    setBuscando(true);
    setArca(undefined);
    try {
      const datos = await buscarCuitEnArca(
        token,
        organizationId,
        value.billingTaxId ?? "",
      );
      setName(datos.nombre);
      setValue((actual) => ({
        ...actual,
        billingTaxId: datos.cuit,
        billingVatCondition: datos.condicionIva,
        billingAddress: datos.domicilio || actual.billingAddress,
        billingCity: datos.localidad || actual.billingCity,
        billingProvince: datos.provincia || actual.billingProvince,
        billingPostalCode: datos.codigoPostal || actual.billingPostalCode,
      }));
      setArca({
        ok: true,
        mensaje: `Datos de ARCA${datos.environment === "HOMOLOGATION" ? " (homologación)" : ""}: ${datos.nombre} · ${datos.condicionIva}${datos.estado && datos.estado !== "ACTIVO" ? ` · Clave ${datos.estado.toLowerCase()}` : ""}. Revisalos antes de guardar.`,
      });
    } catch (cause) {
      setArca({
        ok: false,
        mensaje:
          cause instanceof Error
            ? cause.message
            : "No se pudo buscar el CUIT en ARCA.",
      });
    } finally {
      setBuscando(false);
    }
  };
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
    <label className="block text-sm text-slate-500">
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
  // El CUIT/DNI identifica al cliente: si ya lo tiene otro, no se guarda.
  // Como el servidor, sólo cuando el CUIT cambia: una ficha vieja repetida se
  // puede seguir editando.
  const documentoRepetido =
    normalizedCustomerDocument(value.billingTaxId) !==
      normalizedCustomerDocument(customer?.billingTaxId) &&
    matchingCustomerDocuments(customers, value.billingTaxId, customer?.id)
      .length > 0;
  const submit = async () => {
    if (gate.current || documentoRepetido) return;
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      if (customer) {
        await updateCustomerBilling(
          token,
          organizationId,
          customer.id,
          {
            ...value,
            ...(name !== customer.name ? { name: name.trim() } : {}),
            ...(listId !== (customer.priceListId ?? "")
              ? { priceListId: listId || null }
              : {}),
          },
          branchId,
        );
        onSaved(customer.id);
      } else {
        const created = await createParty(
          token,
          organizationId,
          "customers",
          name.trim(),
          "",
          listId || undefined,
          value,
          undefined,
          branchId,
        );
        onSaved(created.id);
      }
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
      className="m-auto w-[min(820px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-velo/35"
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
            <h2 id={titleId} className="text-lg font-semibold">
              {customer ? "Editar cliente" : "Nuevo cliente"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
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
        <div data-product-editor-body className="min-h-0 overflow-y-auto p-5">
          <fieldset disabled={busy} className="space-y-4">
            <section className="rounded-xl border border-slate-200 p-4">
              <label
                htmlFor={`${titleId}-cuit`}
                className="text-base font-semibold text-slate-800"
              >
                CUIT / CUIL / DNI
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id={`${titleId}-cuit`}
                  autoFocus
                  className={`${field} min-w-0 flex-1`}
                  maxLength={32}
                  placeholder="30-12345678-9"
                  value={value.billingTaxId ?? ""}
                  onChange={(e) => {
                    setValue({ ...value, billingTaxId: e.target.value });
                    setArca(undefined);
                  }}
                  onKeyDown={(e) => {
                    if (!BUSQUEDA_ARCA || e.key !== "Enter") return;
                    e.preventDefault();
                    void buscarEnArca();
                  }}
                />
                {BUSQUEDA_ARCA && (
                  <button
                    type="button"
                    disabled={buscando || !puedeBuscar}
                    onClick={() => void buscarEnArca()}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    <Search size={16} aria-hidden="true" />
                    {buscando ? "Buscando…" : "Buscar en ARCA"}
                  </button>
                )}
              </div>
              {BUSQUEDA_ARCA && (
                <p className="mt-1.5 text-xs text-slate-500">
                  {puedeBuscar
                    ? "Con el CUIT traemos nombre, condición frente al IVA y domicilio. También podés apretar Enter."
                    : "Sin conexión no se puede buscar en ARCA: cargá los datos a mano."}
                </p>
              )}
              {BUSQUEDA_ARCA && arca && (
                <p
                  role={arca.ok ? "status" : "alert"}
                  className={`mt-2 rounded-lg px-3 py-2 text-xs ${arca.ok ? "bg-teal-50 text-teal-800" : "bg-rose-50 text-rose-800"}`}
                >
                  {arca.mensaje}
                </p>
              )}
              {documentoRepetido && (
                <CustomerDocumentWarning
                  customers={customers}
                  taxId={value.billingTaxId}
                  excludeId={customer?.id}
                />
              )}
            </section>
            <section className="rounded-xl border border-slate-200 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <UserRound size={17} className="text-teal-700" />
                Datos principales
              </h3>
              <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
                <label className="text-sm text-slate-500">
                  Nombre o razón social <span className="text-rose-500">*</span>
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    className={`${field} mt-1`}
                    value={name}
                    placeholder="Ej. Juan Pérez / Farmacia del Sol"
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="text-sm text-slate-500">
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
                  taxId={value.billingTaxId}
                />
              )}
            </section>
            <Section title="Datos de facturación" icon={<FileText size={17} />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="text-sm text-slate-500 sm:col-span-2">
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
                <p className="mt-3 text-sm text-slate-400">
                  Ficha {customer.id.slice(0, 8)}
                  {customer.document
                    ? ` · Documento registrado: ${customer.document}`
                    : ""}
                </p>
              )}
            </Section>
            <Section title="Contacto" icon={<Phone size={17} />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <PhoneInput
                  label="Teléfono / WhatsApp"
                  value={value.billingPhone}
                  onChange={(billingPhone) =>
                    setValue({ ...value, billingPhone })
                  }
                />
                {input(
                  "billingEmail",
                  "Email",
                  254,
                  "email",
                  "nombre@ejemplo.com",
                )}
                <label className="text-sm text-slate-500 sm:col-span-2">
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
          <button className={primary} disabled={busy || documentoRepetido}>
            <Save size={16} />
            {busy ? "Guardando…" : "Guardar cliente"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
