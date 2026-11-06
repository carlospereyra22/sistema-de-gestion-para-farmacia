import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("./price-lists-workspace.tsx", import.meta.url),
  "utf8",
);

it("usa el selector del sistema, sin select nativo", () => {
  expect(source).toContain("<ProductFilterSelect");
  expect(source).not.toContain("<select");
});

it("la lista de un selector abre hacia donde entra dentro del diálogo", () => {
  expect(source).toContain("data-product-editor-body");
});

it("pagina con la versión integrada de la tarjeta", () => {
  expect(source.split("<Pagination")[1]).toContain("integrated");
});
