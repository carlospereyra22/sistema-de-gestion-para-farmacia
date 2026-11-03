import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseSurface } from "./purchases-workspace";

describe("PurchaseSurface", () => {
  it("muestra la recepción como una pantalla con regreso al listado", () => {
    const markup = renderToStaticMarkup(
      <PurchaseSurface
        page
        title="Recibir mercadería"
        subtitle="Compra 123 · Proveedor · Casa Central"
        onBack={() => undefined}
        close={() => undefined}
        summary={<p>Unidades pendientes: 20</p>}
        footer={<footer>Confirmar recepción</footer>}
      >
        <p>Datos de la entrega</p>
      </PurchaseSurface>,
    );

    expect(markup).toContain("Recibir mercadería");
    expect(markup).toContain("Volver a Compras");
    expect(markup).toContain("Datos de la entrega");
    expect(markup.indexOf("Unidades pendientes: 20")).toBeLessThan(
      markup.indexOf("<section"),
    );
    expect(markup.indexOf("Confirmar recepción")).toBeGreaterThan(
      markup.indexOf("Datos de la entrega"),
    );
    expect(markup).not.toContain("<dialog");
  });
});
