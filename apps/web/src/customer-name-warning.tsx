import {
  matchingCustomerDocuments,
  matchingCustomerNames,
  normalizedCustomerDocument,
  customerIdentityDetail,
  type CustomerIdentity,
} from "./lib/customer-identity";

const ficha = (customer: CustomerIdentity) =>
  `${customer.name} · ${customerIdentityDetail(customer) || `Ficha ${customer.id.slice(0, 8)}`}${customer.active === false ? " · Eliminado" : ""}`;

/**
 * Nombre repetido. Lo que identifica al cliente es el CUIT/DNI: si el nuevo
 * tiene uno distinto al de todos los homónimos, sólo se informa. Sin CUIT para
 * comparar, hay que confirmar que es otra persona.
 */
export function CustomerNameWarning({
  customers,
  name,
  excludeId,
  taxId,
}: {
  customers: CustomerIdentity[];
  name: string;
  excludeId?: string;
  taxId?: string | null;
}) {
  const matches = matchingCustomerNames(customers, name, excludeId);
  if (!matches.length) return null;
  const propio = normalizedCustomerDocument(taxId);
  const distinto =
    propio !== "" &&
    matches.every((customer) => {
      const otros = [customer.billingTaxId, customer.document]
        .map(normalizedCustomerDocument)
        .filter(Boolean);
      return otros.length > 0 && !otros.includes(propio);
    });
  if (distinto)
    return (
      <p
        role="status"
        className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
      >
        Hay otro cliente con este nombre, con distinto CUIT/DNI:{" "}
        {matches.map(ficha).join(" · ")}
      </p>
    );
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p role="status" className="font-medium">
        Ya existe un cliente con este nombre.
      </p>
      <ul className="my-2 space-y-1">
        {matches.map((customer) => (
          <li key={customer.id}>{ficha(customer)}</li>
        ))}
      </ul>
      <label className="flex items-start gap-2">
        <input
          key={`${name}:${matches.map((customer) => customer.id).join(",")}`}
          type="checkbox"
          required
          className="mt-0.5 accent-teal-700"
        />
        Es otra persona; quiero guardar este cliente. Cargale el CUIT/DNI para
        diferenciarlo.
      </label>
    </div>
  );
}

/** CUIT/DNI repetido: no se puede guardar, igual que en el servidor. */
export function CustomerDocumentWarning({
  customers,
  taxId,
  excludeId,
}: {
  customers: CustomerIdentity[];
  taxId?: string | null;
  excludeId?: string;
}) {
  const matches = matchingCustomerDocuments(customers, taxId, excludeId);
  if (!matches.length) return null;
  const eliminado = matches.some((customer) => customer.active === false);
  return (
    <div
      role="alert"
      className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
    >
      <p className="font-medium">
        Ya existe un cliente con este CUIT/DNI: {matches.map(ficha).join(" · ")}
      </p>
      <p className="mt-1">
        {eliminado
          ? "Está eliminado: restauralo desde Mostrar eliminados en lugar de crear otro."
          : "Usá esa ficha en lugar de crear otra."}
      </p>
    </div>
  );
}
