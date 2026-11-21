import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SelectorFecha } from "./selector-fecha";

const render = (
  value: string,
  extra: Partial<Parameters<typeof SelectorFecha>[0]> = {},
) =>
  renderToStaticMarkup(
    <SelectorFecha
      label="Desde"
      value={value}
      onChange={() => {}}
      {...extra}
    />,
  );

it("muestra la fecha como se lee acá, sin el calendario del navegador", () => {
  const html = render("2026-11-19");
  expect(html).toContain("19/11/2026");
  expect(html).not.toContain('type="date"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain("jueves, 19 de noviembre de 2026");
});

it("sin fecha muestra el texto vacío elegido", () => {
  expect(render("", { vacio: "Cualquier fecha" })).toContain("Cualquier fecha");
  expect(render("")).toContain("Sin fecha");
});

it("compacto para formularios: h-10 y la etiqueta sólo para lectores", () => {
  const html = render("", { compact: true });
  expect(html).toContain("h-10");
  expect(html).toContain('class="sr-only"');
});
