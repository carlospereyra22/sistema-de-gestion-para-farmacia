import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MoneyInput } from "./money-input";

it("muestra el símbolo de pesos y 0,00 de referencia sin flechas de número", () => {
  const html = renderToStaticMarkup(
    <MoneyInput label="Costo unitario" value="" onChange={vi.fn()} />,
  );
  expect(html).toContain("Costo unitario");
  expect(html).toContain(">$</span>");
  expect(html).toContain('placeholder="0,00"');
  expect(html).toContain('type="text"');
  expect(html).toContain('inputMode="decimal"');
  expect(html).toContain('required=""');
  expect(html).not.toContain("text-right");
});

it("se puede deshabilitar y adaptar a un formulario compacto", () => {
  const html = renderToStaticMarkup(
    <MoneyInput
      label="Efectivo contado"
      value=""
      onChange={vi.fn()}
      disabled
      labelClassName="block text-xs"
    />,
  );
  expect(html).toContain('<label class="block text-xs"');
  expect(html).toMatch(/<input[^>]*disabled=""/);
});

it("muestra el importe recibido", () => {
  expect(
    renderToStaticMarkup(
      <MoneyInput label="Costo" value="1.000,50" onChange={vi.fn()} />,
    ),
  ).toContain('value="1.000,50"');
});
