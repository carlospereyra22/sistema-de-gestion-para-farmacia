import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CashOpeningSuggestion } from "./cash-opening-suggestion";

describe("CashOpeningSuggestion", () => {
  const html = renderToStaticMarkup(
    <CashOpeningSuggestion amountMinor="200000" onUse={() => undefined} />,
  );

  it("muestra el importe separado de la acción", () => {
    expect(html).toContain("Dinero efectivo contado en el último cierre");
    expect(html).toContain("2.000,00");
    expect(html).toContain(">Usar</button>");
  });
  it("no envía el formulario de apertura y describe la acción", () => {
    expect(html).toContain('type="button"');
    expect(html).toContain(
      'aria-label="Usar el efectivo contado en el último cierre:',
    );
  });
});
