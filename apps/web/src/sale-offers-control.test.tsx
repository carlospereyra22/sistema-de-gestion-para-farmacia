import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleOffersControl } from "./sale-offers-control";
import { SaleCurrentPanel } from "./sale-current-panel";

describe("ofertas de la venta en el pie", () => {
  it("el botón dice cuántas hay y cuántas se quitaron", () => {
    const html = renderToStaticMarkup(
      <SaleOffersControl
        aplicadas={[
          {
            id: "o1",
            label: "Desde $100.000 -10%",
            nombre: "Compras grandes",
            ahorroMinor: 530000,
          },
        ]}
        quitadas={[{ id: "o2", label: "2x1", nombre: "2x1 shampoo" }]}
        onQuitar={() => {}}
        onAplicar={() => {}}
      />,
    );
    expect(html).toContain("Ahorro por ofertas");
    expect(html).toContain("(1 quitada)");
    expect(html).toContain('aria-expanded="false"');
  });

  it("con todas quitadas no muestra un ahorro en cero", () => {
    const html = renderToStaticMarkup(
      <SaleOffersControl
        aplicadas={[]}
        quitadas={[{ id: "o2", label: "2x1", nombre: "2x1 shampoo" }]}
        onQuitar={() => {}}
        onAplicar={() => {}}
      />,
    );
    expect(html).toContain("1 oferta quitada");
    expect(html).not.toContain("Ahorro por ofertas");
  });

  it("sin ofertas no muestra nada", () => {
    expect(
      renderToStaticMarkup(
        <SaleOffersControl
          aplicadas={[]}
          quitadas={[]}
          onQuitar={() => {}}
          onAplicar={() => {}}
        />,
      ),
    ).toBe("");
  });

  it("va junto al ahorro por ofertas", () => {
    const html = renderToStaticMarkup(
      <SaleCurrentPanel
        lineCount={1}
        unitCount={1}
        totalMinor={100}
        offerSavingsMinor={530000}
        offerControl={<button type="button">Título que abre</button>}
        checkoutDisabled={false}
        submitting={false}
        context={null}
        lines={null}
        discount={null}
        onClear={() => {}}
        onCheckout={() => {}}
      />,
    );
    // El control reemplaza al título: no suma otro elemento al pie.
    expect(html).toContain("Título que abre");
    expect(html).not.toContain("<span>Ahorro por ofertas</span>");
  });
});
