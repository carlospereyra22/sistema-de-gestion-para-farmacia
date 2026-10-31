import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@gestion/contracts";
import {
  CategorySymbol,
  CatalogOptionsManager,
  CatalogOptionsTitle,
} from "./catalog-options-manager";
it("shows a single title with a decorative catalog icon and no subtitle", () => {
  const html = renderToStaticMarkup(<CatalogOptionsTitle />);
  expect(html.match(/<h1/g)).toHaveLength(1);
  expect(html).toContain("Categorías y laboratorios");
  expect(html).toContain("lucide-folder-tree");
  expect(html).not.toMatch(/<p[\s>]/);
});
it("renders every supported pharmacy icon and color", () => {
  for (const icon of CATEGORY_ICONS) {
    for (const color of CATEGORY_COLORS) {
      const html = renderToStaticMarkup(
        <CategorySymbol name="Categoría" icon={icon} color={color} />,
      );
      expect(html).toContain("<svg");
      expect(html).not.toContain("undefined");
    }
  }
});
it("applies an explicit color independently of the icon", () => {
  const html = renderToStaticMarkup(
    <CategorySymbol name="Medicamentos" icon="box" color="rose" />,
  );
  expect(html).toContain("text-rose-500");
  expect(html).toContain("lucide-box");
});

it("uses reference icons and a neutral fallback without remote images", () => {
  for (const name of [
    "Medicamentos",
    "Dermocosmética",
    "Higiene",
    "Perfumería",
    "Suplementos",
    "Accesorios",
    "Otra categoría",
  ]) {
    const html = renderToStaticMarkup(<CategorySymbol name={name} />);
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
    expect(html).toContain('aria-hidden="true"');
  }
});
it("provides separate accessible creation and search fields without invented counts", () => {
  const html = renderToStaticMarkup(
    <CatalogOptionsManager
      token="test"
      organizationId="org"
      onError={() => {}}
    />,
  );
  for (const label of ["Nueva categoría", "Buscar categorías"])
    expect(html).toContain(`aria-label="${label}"`);
  expect(html).toContain('role="tablist"');
  expect(html).toContain('id="catalog-tab-laboratories"');
  expect(html).not.toContain('aria-label="Nuevo laboratorio"');
  expect(html).toContain("Cargando…");
  expect(html).not.toContain("Productos del catálogo de la organización");
  expect(html).not.toContain("Agrupá y encontrá tus productos.");
  expect(html).not.toContain("Identificá cada laboratorio con su logo.");
  expect(html).not.toContain("1.932");
});
