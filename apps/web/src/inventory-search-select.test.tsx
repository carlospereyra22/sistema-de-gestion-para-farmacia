import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InventorySearchSelect } from "./inventory-search-select";
const options = [
  {
    value: "a",
    label: "Loratadina",
    detail: "Laboratorio A · 10 mg · 10 comprimidos",
    searchText: "Loratadina Laboratorio A",
  },
  {
    value: "b",
    label: "Loratadina",
    detail: "Laboratorio B · 10 mg · 10 comprimidos",
    searchText: "Loratadina Laboratorio B",
  },
];
it("exposes an accessible required search field instead of a native product dropdown", () => {
  const html = renderToStaticMarkup(
    <InventorySearchSelect
      label="Producto"
      value=""
      options={options}
      onChange={() => {}}
    />,
  );
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('required=""');
  expect(html).toContain("Nombre, laboratorio o código");
  expect(html).not.toContain("<select");
});
it("retains laboratory and presentation next to the selected medicine", () => {
  const html = renderToStaticMarkup(
    <InventorySearchSelect
      label="Producto"
      value="b"
      options={options}
      onChange={() => {}}
    />,
  );
  expect(html).toContain('value="Loratadina"');
  expect(html).toContain("Laboratorio B · 10 mg · 10 comprimidos");
  expect(html).not.toContain("Laboratorio A");
  expect(html).toContain("aria-describedby=");
});
