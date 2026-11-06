import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stockAdjustmentCost } from "./lib/stock-adjustment";
import { StockAdjustmentCost } from "./stock-adjustment-cost";

const render = (
  props: Partial<Parameters<typeof StockAdjustmentCost>[0]> = {},
) =>
  renderToStaticMarkup(
    <StockAdjustmentCost
      lastCostMinor="570861"
      mode="none"
      onModeChange={() => {}}
      value=""
      onChange={() => {}}
      {...props}
    />,
  );

describe("StockAdjustmentCost", () => {
  it("ofrece las tres opciones y muestra el último costo asociado", () => {
    const html = render();
    expect(html).toContain("Sin costo");
    expect(html).toContain("Último costo");
    expect(html).toContain("Otro costo");
    expect(html).toContain("Último costo asociado:");
    expect(html).toContain("5.708,61");
    expect(html).not.toContain('disabled=""');
  });
  it("pide el costo sólo con Otro costo", () => {
    expect(render()).not.toContain("Costo unitario");
    expect(render({ mode: "other" })).toContain("Costo unitario");
  });
  it("sin costo conocido lo avisa y no deja usar el último", () => {
    const html = render({ lastCostMinor: "0" });
    expect(html).toContain("Este lote no tiene un costo asociado.");
    expect(html).toContain('disabled=""');
  });
  it("sin lote elegido no muestra el cartel", () => {
    expect(render({ lastCostMinor: undefined })).not.toContain("asociado");
  });
});

describe("stockAdjustmentCost", () => {
  it("no envía costo al restar ni con Sin costo", () => {
    expect(stockAdjustmentCost("last", "subtract", "100", "")).toBeUndefined();
    expect(stockAdjustmentCost("none", "add", "100", "5")).toBeUndefined();
  });
  it("usa el último costo o el escrito, en centavos", () => {
    expect(stockAdjustmentCost("last", "add", "570861", "")).toBe(570861);
    expect(stockAdjustmentCost("other", "add", "100", "1.250,50")).toBe(125050);
  });
  it("exige un importe con Otro costo", () => {
    expect(() => stockAdjustmentCost("other", "add", "100", "")).toThrow(
      "Ingresá un costo",
    );
  });
});
