import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  CustomerDocumentWarning,
  CustomerNameWarning,
} from "./customer-name-warning";
import {
  matchingCustomerDocuments,
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
it("el CUIT distinto alcanza para diferenciar a dos clientes con el mismo nombre", () => {
  const conCuit = [{ ...customers[0], billingTaxId: "20-11111111-1" }];
  const html = renderToStaticMarkup(
    <CustomerNameWarning
      customers={conCuit}
      name="Carlos Pérez"
      taxId="20222222222"
    />,
  );
  expect(html).toContain("distinto CUIT/DNI");
  expect(html).not.toContain('type="checkbox"');
  // Sin CUIT para comparar sigue pidiendo confirmar que es otra persona.
  expect(
    renderToStaticMarkup(
      <CustomerNameWarning customers={conCuit} name="Carlos Pérez" />,
    ),
  ).toContain('type="checkbox" required=""');
});
it("avisa el CUIT repetido aunque esté escrito con puntos o guiones", () => {
  const conCuit = [{ ...customers[0], billingTaxId: "20-11111111-1" }];
  expect(matchingCustomerDocuments(conCuit, "20.11111111.1")).toHaveLength(1);
  expect(matchingCustomerDocuments(conCuit, "")).toEqual([]);
  expect(
    matchingCustomerDocuments(conCuit, "20111111111", "customer-1"),
  ).toEqual([]);
  const html = renderToStaticMarkup(
    <CustomerDocumentWarning customers={conCuit} taxId="20111111111" />,
  );
  expect(html).toContain("Ya existe un cliente con este CUIT/DNI");
  expect(html).toContain('role="alert"');
});
