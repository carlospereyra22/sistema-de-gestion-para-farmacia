import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CashClosingRules } from "./cash-rules-settings";

it("uses the floating selector so opening the default-register menu does not grow the form", () => {
  const source = readFileSync(
    new URL("./cash-rules-settings.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain('label="Caja predeterminada"');
  expect(source).not.toContain("inlineOptions");
});

it("explains fixed closing rules without presenting configurable controls", () => {
  const html = renderToStaticMarkup(<CashClosingRules />);
  expect(html).toContain("Reglas fijas");
  expect(html).toContain("No requieren selección ni guardado");
  expect(html.match(/<dt /g)).toHaveLength(4);
  expect(html).toContain("Confirmación final");
  expect(html).toContain("negativo es faltante; positivo es sobrante");
  expect(html).not.toMatch(/<(input|select|button|form)\b/);
});

it("keeps recoverable deletion guidance in an optional help disclosure", () => {
  const html = renderToStaticMarkup(<CashClosingRules />);
  expect(html).toContain("<details");
  expect(html).not.toMatch(/<details[^>]*\bopen/);
  expect(html).toContain("¿Qué hace Eliminar en el historial?");
  expect(html).toContain("No borra sus movimientos");
  expect(html).toContain("Historial de cierres");
});
