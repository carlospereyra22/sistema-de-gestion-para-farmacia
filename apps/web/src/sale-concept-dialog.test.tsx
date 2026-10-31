import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseConceptAmount,
  conceptMaximumQuantity,
} from "./lib/concept-amount";
import { SaleConceptMenu } from "./sale-concept-menu";
import { SaleDocumentChoice } from "./sale-document-choice";

it("parses pesos and cents without guessing ambiguous separators", () => {
  expect(parseConceptAmount("1500,25")).toBe(150025);
  expect(parseConceptAmount("1000")).toBe(100000);
  expect(parseConceptAmount("0,01")).toBe(1);
  for (const value of ["", "-2", "0", "1.500", "1,234", "1e3", "999999999999"])
    expect(parseConceptAmount(value)).toBeUndefined();
});
it("keeps concepts behind the compact more-options button", () => {
  const html = renderToStaticMarkup(
    <SaleConceptMenu disabled={false} onAdd={vi.fn()} />,
  );
  expect(html).toContain("Más opciones para cargar la venta");
  expect(html).toContain('aria-expanded="false"');
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).not.toContain("Agregar concepto");
});
it("keeps invoicing configuration separate from adding concepts", () => {
  const html = renderToStaticMarkup(
    <SaleDocumentChoice
      value="INTERNAL"
      disabled={false}
      onChange={vi.fn()}
      onConfigure={vi.fn()}
    />,
  );
  expect(html).toContain("Configuración de facturación");
  expect(html).not.toContain("Agregar concepto");
});
it("allows large concept quantities while keeping monetary arithmetic exact", () => {
  expect(conceptMaximumQuantity(100000)).toBeGreaterThanOrEqual(1000);
  expect(conceptMaximumQuantity(1)).toBe(2147483647);
  expect(conceptMaximumQuantity(2147483647) * 2147483647).toBeLessThanOrEqual(
    Number.MAX_SAFE_INTEGER,
  );
  expect(conceptMaximumQuantity(0)).toBe(0);
});
