import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ListPriceInput } from "./list-price-input";

it("shows an editable empty field when no new price is prepared", () => {
  const html = renderToStaticMarkup(
    <ListPriceInput name="Producto" disabled={false} onChange={vi.fn()} />,
  );
  expect(html).toContain('aria-label="Nuevo precio de Producto"');
  expect(html).toContain('placeholder="—"');
  expect(html).toContain('value=""');
  expect(html).not.toContain('disabled=""');
});
it.each(["95050", "0"])(
  "displays prepared prices, including mass adjustments and zero (%s)",
  (amount) => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      <ListPriceInput
        name="Producto"
        amount={amount}
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(html).toContain(amount === "0" ? "0,00" : "950,50");
    expect(html).toContain("bg-teal-50");
    expect(onChange).not.toHaveBeenCalled();
  },
);
it("locks price edits while a save is in progress", () => {
  expect(
    renderToStaticMarkup(
      <ListPriceInput
        name="Producto"
        amount="100"
        disabled
        onChange={vi.fn()}
      />,
    ),
  ).toContain('disabled=""');
});
