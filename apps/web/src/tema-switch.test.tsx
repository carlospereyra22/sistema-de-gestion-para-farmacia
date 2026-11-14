import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TemaSwitch } from "./tema-switch";

it("muestra el switch de modo oscuro apagado en el tema claro", () => {
  const html = renderToStaticMarkup(
    <TemaSwitch tema="claro" onChange={() => {}} />,
  );
  expect(html).toContain('role="switch"');
  expect(html).toContain('aria-checked="false"');
  expect(html).toContain("Modo oscuro");
  expect(html).toContain('title="Usar el modo oscuro"');
});

it("muestra el switch encendido en el tema oscuro", () => {
  const html = renderToStaticMarkup(
    <TemaSwitch tema="oscuro" onChange={() => {}} />,
  );
  expect(html).toContain('aria-checked="true"');
  expect(html).toContain("translate-x-4");
  expect(html).toContain('title="Volver al modo claro"');
});
