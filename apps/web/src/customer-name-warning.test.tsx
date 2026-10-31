import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CustomerNameWarning } from "./customer-name-warning";
import {
  matchingCustomerNames,
  customerIdentityDetail,
} from "./lib/customer-identity";
const customers = [
  {
    id: "customer-1",
    name: "Carlos Pérez",
    active: true,
    billingPhone: "123456",
  },
];
it("warns for normalized names and requires acknowledging a different person", () => {
  const html = renderToStaticMarkup(
    <CustomerNameWarning customers={customers} name="  CARLOS  PEREZ " />,
  );
  expect(html).toContain("Ya existe un cliente");
  expect(html).toContain("123456");
  expect(html).toContain('type="checkbox" required=""');
});
it("does not warn for blank, different names or the edited profile itself", () => {
  expect(matchingCustomerNames(customers, "")).toEqual([]);
  expect(
    matchingCustomerNames(customers, "Carlos Pérez", "customer-1"),
  ).toEqual([]);
  expect(
    renderToStaticMarkup(
      <CustomerNameWarning customers={customers} name="Ana" />,
    ),
  ).toBe("");
});
it("shows archived profiles and a reference when optional identity fields are absent", () => {
  const html = renderToStaticMarkup(
    <CustomerNameWarning
      customers={[{ ...customers[0], active: false, billingPhone: null }]}
      name="Carlos Pérez"
    />,
  );
  expect(html).toContain("Eliminado");
  expect(html).toContain("Ficha customer");
  expect(
    customerIdentityDetail({
      id: "a",
      name: "Ana",
      document: "123",
      billingPhone: "456",
    }),
  ).toBe("123 · 456");
});
