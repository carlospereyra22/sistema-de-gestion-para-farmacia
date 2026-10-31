import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerEditor } from "./customer-editor";

const props = {
  customers: [],
  priceLists: [],
  token: "test",
  organizationId: "test",
  onClose: () => undefined,
  onSaved: () => undefined,
};
describe("customer editor", () => {
  it("groups optional profile fields in a scrollable dialog with a fixed footer", () => {
    const html = renderToStaticMarkup(<CustomerEditor {...props} />);
    for (const section of [
      "Datos principales",
      "Datos de facturación",
      "Más datos",
      "Contacto",
      "Observaciones",
    ])
      expect(html).toContain(section);
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("<footer");
    expect(html).toContain('maxLength="1000"');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("<select");
  });
  it("preserves existing contact, notes, legacy VAT and an unavailable assigned list", () => {
    const html = renderToStaticMarkup(
      <CustomerEditor
        {...props}
        customer={{
          id: "customer",
          name: "María",
          active: true,
          priceListId: "old",
          billingVatCondition: "Condición anterior",
          billingEmail: "maria@example.com",
          notes: "Entregar por la tarde",
        }}
      />,
    );
    for (const value of [
      "Editar cliente",
      "Condición anterior",
      "Lista asignada",
      "maria@example.com",
      "Entregar por la tarde",
    ])
      expect(html).toContain(value);
  });
});
