import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SearchableSaleSelect } from "./searchable-sale-select";
import { filterSearchOptions } from "./lib/search-options";
it("uses compact sizing only when requested", () => {
  const props = { label: "Caja", value: "", options: [], onChange: () => {} };
  expect(
    renderToStaticMarkup(<SearchableSaleSelect {...props} compact />),
  ).toContain("h-8 text-xs");
  expect(renderToStaticMarkup(<SearchableSaleSelect {...props} />)).toContain(
    "h-10 text-sm",
  );
});
it("supports the cash selector style and disabled state without a native dropdown", () => {
  const html = renderToStaticMarkup(
    <SearchableSaleSelect
      label="Caja de destino"
      placeholder="Seleccionar caja…"
      value="central"
      options={[{ value: "central", label: "Caja central" }]}
      onChange={() => {}}
      tinted
      inlineOptions
      disabled
    />,
  );
  expect(html).toContain('value="Caja central"');
  expect(html).toContain("disabled");
  expect(html).toContain("border-teal-200");
  expect(html).not.toContain("<select");
});

it("searches names ignoring accents and case while preserving distinct IDs", () => {
  const options = [
    { value: "a", label: "José Pérez" },
    { value: "b", label: "José Pérez" },
    { value: "", label: "Público general" },
  ];
  expect(filterSearchOptions(options, "PERE jos")).toEqual(options.slice(0, 2));
  expect(filterSearchOptions(options, "publico")).toEqual([options[2]]);
  expect(filterSearchOptions(options, "missing")).toEqual([]);
  expect(filterSearchOptions(options, "")).toEqual(options);
});
it.each(["Público general", "Según cliente"])(
  "preserves the empty-value selection %s",
  (label) => {
    const html = renderToStaticMarkup(
      <SearchableSaleSelect
        label="Cliente"
        value=""
        options={[{ value: "", label }]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain(`value="${label}"`);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
  },
);
