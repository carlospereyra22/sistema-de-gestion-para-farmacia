import { renderToStaticMarkup } from "react-dom/server";
import { Save, X } from "lucide-react";
import { expect, it } from "vitest";
import { Boton } from "./boton";

it("lleva el ícono en su recuadro y la tecla a la vista", () => {
  const html = renderToStaticMarkup(
    <Boton icono={<X size={15} />} tecla="Esc">
      Cancelar
    </Boton>,
  );
  expect(html).toContain('type="button"');
  expect(html).toMatch(
    /<span aria-hidden="true" class="grid size-7[^"]*rounded-lg/,
  );
  expect(html).toContain("<kbd");
  expect(html).toContain(">Esc</kbd>");
  expect(html).toContain("Cancelar");
});

it("el principal es verde y sin tecla no muestra el atajo", () => {
  const html = renderToStaticMarkup(
    <Boton variante="primario" icono={<Save size={15} />}>
      Guardar pedido
    </Boton>,
  );
  expect(html).toContain("bg-teal-700");
  expect(html).not.toContain("<kbd");
});
