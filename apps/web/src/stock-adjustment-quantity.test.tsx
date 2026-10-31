import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StockAdjustmentQuantity } from "./stock-adjustment-quantity";
import { stockAdjustmentDelta } from "./lib/stock-adjustment";

describe("explicit stock adjustment direction", () => {
  it("sends the selected quantity with the correct sign", () => {
    expect(stockAdjustmentDelta("4", "subtract")).toBe(-4);
    expect(stockAdjustmentDelta("4", "add")).toBe(4);
  });
  it.each([
    "0",
    "",
    " ",
    "-4",
    "1.5",
    "invalid",
    "Infinity",
    "9007199254740992",
  ])("rejects invalid amount %s", (value) => {
    expect(() => stockAdjustmentDelta(value, "subtract")).toThrow(
      "mayor que 0",
    );
  });
  it.each(["subtract", "add"] as const)(
    "shows the selected %s action without submitting the form",
    (direction) => {
      const html = renderToStaticMarkup(
        <StockAdjustmentQuantity
          direction={direction}
          onDirectionChange={() => undefined}
          value="4"
          onChange={() => undefined}
          inputRef={{ current: null }}
        />,
      );
      expect(html).toContain(
        direction === "subtract" ? "Unidades a restar" : "Unidades a sumar",
      );
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
      expect(html.match(/type="button"/g)).toHaveLength(2);
      expect(html).toContain('value="4"');
      expect(html).toContain('min="0"');
    },
  );
});
