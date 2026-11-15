import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SaleStockSwitch } from "./sale-stock-switch";

describe("SaleStockSwitch", () => {
  it("se muestra como switch accesible activado", () => {
    const html = renderToStaticMarkup(
      <SaleStockSwitch checked onChange={() => undefined} />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Con stock"');
    expect(html).toContain("translate-x-4");
  });

  it("se muestra desactivado sin desplazar la perilla", () => {
    const html = renderToStaticMarkup(
      <SaleStockSwitch checked={false} onChange={() => undefined} />,
    );
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("translate-x-0");
  });
});
