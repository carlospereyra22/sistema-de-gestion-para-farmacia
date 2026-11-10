export type CustomerIdentity = {
  id: string;
  name: string;
  active?: boolean;
  document?: string | null;
  billingTaxId?: string | null;
  billingPhone?: string | null;
};
export const normalizedCustomerName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-AR");
export const customerIdentityDetail = (customer: CustomerIdentity) =>
  [customer.billingTaxId || customer.document, customer.billingPhone]
    .filter(Boolean)
    .join(" · ");
/** CUIT/DNI comparable, igual que el servidor: sin espacios, puntos ni guiones. */
export const normalizedCustomerDocument = (value?: string | null) =>
  (value ?? "").replace(/[\s.-]/g, "").toUpperCase();
/** Clientes (también eliminados) que ya tienen ese CUIT/DNI. */
export const matchingCustomerDocuments = (
  customers: CustomerIdentity[],
  document: string | null | undefined,
  excludeId?: string,
) => {
  const key = normalizedCustomerDocument(document);
  return key
    ? customers.filter(
        (customer) =>
          customer.id !== excludeId &&
          [customer.document, customer.billingTaxId].some(
            (value) => normalizedCustomerDocument(value) === key,
          ),
      )
    : [];
};
export const matchingCustomerNames = (
  customers: CustomerIdentity[],
  name: string,
  excludeId?: string,
) => {
  const normalized = normalizedCustomerName(name);
  return normalized
    ? customers.filter(
        (customer) =>
          customer.id !== excludeId &&
          normalizedCustomerName(customer.name) === normalized,
      )
    : [];
};
