import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CatalogOptionSelect } from "./catalog-option-select";

const props = {
  label: "Categoría",
  emptyLabel: "Sin categoría",
  value: "",
  options: [{ id: "a", name: "Medicamentos" }],
  onChange: () => {},
  onCreate: async (name: string) => ({ id: "b", name }),
};
it("uses a compact labeled search field, with no nested form or implicit create button", () => {
  const html = renderToStaticMarkup(<CatalogOptionSelect {...props} />);
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('placeholder="Sin categoría"');
  expect(html).not.toContain("<form");
  expect(html).not.toContain("<select");
});
it("retains the selected category name and allows disabling while the parent saves", () => {
  const html = renderToStaticMarkup(
    <CatalogOptionSelect {...props} value="a" disabled />,
  );
  expect(html).toContain('value="Medicamentos"');
  expect(html).toContain('disabled=""');
});
