import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PurchaseExitDialog, PurchaseHelp } from "./purchase-dialog-extras";

describe("purchase dialog help and exit", () => {
  const handlers = {
    onContinue: () => {},
    onSave: () => {},
    onDiscard: () => {},
  };
  it("offers labeled exit content without opening another dialog", () => {
    const html = renderToStaticMarkup(
      <PurchaseExitDialog locked={false} {...handlers} />,
    );
    expect(html).not.toContain("<dialog");
    expect(html).toContain("<section");
    expect(html).toContain("aria-describedby");
    expect(html).toContain("Guardar borrador y salir");
    expect(html).toContain("Seguir trabajando");
    expect(html).toContain("Descartar borrador");
  });
  it("never offers to discard an uncertain submitted operation", () => {
    const html = renderToStaticMarkup(
      <PurchaseExitDialog locked {...handlers} />,
    );
    expect(html).not.toContain("Descartar borrador");
    expect(html).toContain("misma solicitud");
  });
  it("exposes the explanatory text to hover and keyboard focus", () => {
    const html = renderToStaticMarkup(
      <PurchaseHelp label="Ayuda sobre modalidad">No suma stock.</PurchaseHelp>,
    );
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("group-focus-within:visible");
    expect(html).toContain("group-hover:visible");
    expect(html).toContain("No suma stock.");
  });
});
