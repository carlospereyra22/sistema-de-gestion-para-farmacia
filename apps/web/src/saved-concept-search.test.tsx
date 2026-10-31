import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SavedConceptSearch } from "./saved-concept-search";
import { filterConcepts } from "./lib/saved-sale-concepts";

it("filters partial words regardless of accents, case or word order", () => {
  const items = ["Pastilla suelta", "Apósitos chicos", "Otra cosa"];
  expect(filterConcepts(items, "SUEL pas")).toEqual(["Pastilla suelta"]);
  expect(filterConcepts(items, "apos")).toEqual(["Apósitos chicos"]);
  expect(filterConcepts(items, " ")).toEqual(items);
  expect(filterConcepts(items, "inexistente")).toEqual([]);
});
it("provides a labeled searchable combobox without preselecting a concept", () => {
  const html = renderToStaticMarkup(
    <SavedConceptSearch items={["Pastilla"]} onSelect={() => {}} />,
  );
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('placeholder="Buscar descripción…"');
  expect(html).toContain('value=""');
});
