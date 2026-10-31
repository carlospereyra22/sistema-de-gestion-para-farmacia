import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FractionalPriceFields } from "./fractional-price-fields";
import { fractionalPricePreview } from "./lib/fractional-price-preview";
it("matches the server formula with a single final rounding", () => {
  expect(fractionalPricePreview("1285957", "2", "10")).toBe("707276");
  expect(fractionalPricePreview("1285957", "2", "0")).toBe("642979");
  expect(fractionalPricePreview("10000", "20", "25")).toBe("625");
  expect(fractionalPricePreview(null, "2", "0")).toBeNull();
  expect(fractionalPricePreview("10000", "0", "0")).toBeNull();
  expect(fractionalPricePreview("10000", "2", "-1")).toBeNull();
});
it.each([true, false])(
  "shows linked or manual price bases without stock controls (%s)",
  (linked) => {
    const html = renderToStaticMarkup(
      <FractionalPriceFields
        enabled
        linked={linked}
        base="12859.57"
        divisor="2"
        markup="10"
        result="707276"
        disabled={false}
        onEnabled={vi.fn()}
        onBase={vi.fn()}
        onDivisor={vi.fn()}
        onMarkup={vi.fn()}
      />,
    );
    expect(html).toContain("Dividir por");
    expect(html).toContain("Recargo (%)");
    expect(html).toContain("7.072,76");
    expect(html).toContain(linked ? "automáticamente" : "precio base manual");
    expect(html).toContain("no divide el stock");
  },
);
it("keeps the form compact when fractional pricing is disabled", () => {
  const html = renderToStaticMarkup(
    <FractionalPriceFields
      enabled={false}
      linked={false}
      base=""
      divisor="2"
      markup="0"
      result={null}
      disabled={false}
      onEnabled={vi.fn()}
      onBase={vi.fn()}
      onDivisor={vi.fn()}
      onMarkup={vi.fn()}
    />,
  );
  expect(html).toContain("Fraccionar precio");
  expect(html).not.toContain("Dividir por");
});
