import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductSyncStatus } from "./product-sync-status";

const product = {
  active: true,
  externalReferenceSource: "official" as const,
  externalReferenceName: "Actron",
  externalReferenceCheckedAt: "2026-09-09T12:00:00Z",
};
describe("product reference status", () => {
  it("shows saved links without selecting a new reference", () => {
    const html = renderToStaticMarkup(<ProductSyncStatus product={product} />);
    expect(html).toContain("Vinculado");
    expect(html).toContain("text-emerald-700");
    expect(html).toContain('role="tooltip" hidden=""');
    expect(html).toContain("09:00 y 17:00");
    expect(html).toContain("Actualiza el precio general de venta por caja");
    expect(html).not.toContain("no el precio de venta");
    expect(html).toContain("09:00:00");
    expect(html).toContain("no indica necesariamente una ejecución programada");
    expect(html).not.toMatch(/<p[\s>]/);
  });
  it("does not label an unsaved link as active", () => {
    const html = renderToStaticMarkup(
      <ProductSyncStatus product={product} pendingName="Otra referencia" />,
    );
    expect(html).toContain("Sin guardar");
    expect(html).not.toContain("automática habilitada");
    expect(html).not.toContain("Última revisión");
  });
  it("distinguishes inactive and unlinked products", () => {
    expect(
      renderToStaticMarkup(
        <ProductSyncStatus product={{ ...product, active: false }} />,
      ),
    ).toContain("actualización pausada");
    expect(renderToStaticMarkup(<ProductSyncStatus />)).toBe("");
  });
});
