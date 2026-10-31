import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CustomerBillingFields,
  CustomerContactFields,
} from "./customer-billing";
describe("customer billing form", () => {
  it("keeps every billing field optional", () => {
    const html = renderToStaticMarkup(
      <CustomerBillingFields value={{}} onChange={() => undefined} />,
    );
    expect(html).not.toContain("Nombre o razón social");
    expect(html).toContain("CUIT / CUIL / DNI");
    expect(html).toContain("<select");
    expect(html).toContain("Más datos");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain("required");
  });
  it("preserves a previously entered VAT condition", () => {
    const html = renderToStaticMarkup(
      <CustomerBillingFields
        value={{ billingVatCondition: "Condición anterior" }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('value="Condición anterior"');
    expect(html).toContain('selected=""');
  });
  it("keeps contact optional and separate from billing", () => {
    const html = renderToStaticMarkup(
      <CustomerContactFields
        value={{ billingEmail: "cliente@example.com" }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Contacto");
    expect(html).toContain('type="email"');
    expect(html).toContain("cliente@example.com");
    expect(html).not.toContain("required");
  });
});
