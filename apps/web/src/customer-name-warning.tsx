import {
  matchingCustomerNames,
  customerIdentityDetail,
  type CustomerIdentity,
} from "./lib/customer-identity";

export function CustomerNameWarning({
  customers,
  name,
  excludeId,
}: {
  customers: CustomerIdentity[];
  name: string;
  excludeId?: string;
}) {
  const matches = matchingCustomerNames(customers, name, excludeId);
  if (!matches.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p role="status" className="font-medium">
        Ya existe un cliente con este nombre.
      </p>
      <ul className="my-2 space-y-1">
        {matches.map((customer) => (
          <li key={customer.id}>
            {customer.name} ·{" "}
            {customerIdentityDetail(customer) ||
              `Ficha ${customer.id.slice(0, 8)}`}
            {customer.active === false ? " · Eliminado" : ""}
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2">
        <input
          key={`${name}:${matches.map((customer) => customer.id).join(",")}`}
          type="checkbox"
          required
          className="mt-0.5 accent-teal-700"
        />
        Es otra persona; quiero guardar este cliente.
      </label>
    </div>
  );
}
