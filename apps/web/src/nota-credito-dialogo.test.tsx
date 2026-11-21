import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Sale } from "./lib/api";
import { NotaCreditoBoton } from "./nota-credito-dialogo";

const venta = (status: Sale["status"]) =>
  ({ id: "venta", status, totalMinor: "1000" }) as Sale;

describe("botón Nota de crédito", () => {
  it("se ofrece en ventas confirmadas, con su ícono en recuadro", () => {
    const html = renderToStaticMarkup(
      <NotaCreditoBoton
        token="t"
        organizationId="o"
        branchId="b"
        sale={venta("COMPLETED")}
        onDone={() => {}}
      />,
    );
    expect(html).toContain("Nota de crédito");
    expect(html).toContain("rounded-lg");
  });

  it("no aparece en una venta anulada", () => {
    expect(
      renderToStaticMarkup(
        <NotaCreditoBoton
          token="t"
          organizationId="o"
          branchId="b"
          sale={venta("CANCELLED")}
          onDone={() => {}}
        />,
      ),
    ).toBe("");
  });
});
