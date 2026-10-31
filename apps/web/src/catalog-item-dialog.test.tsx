import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogItemDialog } from "./catalog-item-dialog";
describe("catalog edit and delete dialogs", () => {
  it("shows a labeled editable name", () => {
    const html = renderToStaticMarkup(
      <CatalogItemDialog
        name="Medicamentos"
        mode="edit"
        onSave={async () => undefined}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("<dialog");
    expect(html).toContain("aria-labelledby");
    expect(html).toContain('value="Medicamentos"');
    expect(html).toContain("Guardar cambios");
  });
  it("requires explicit deletion confirmation and explains associated products", () => {
    const html = renderToStaticMarkup(
      <CatalogItemDialog
        name="Laboratorio"
        mode="delete"
        onSave={async () => undefined}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("Eliminar del catálogo");
    expect(html).toContain("Laboratorio");
    expect(html).toContain("productos asociados");
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("<input");
  });
});
