import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ThermalSetupInstructions } from "./thermal-setup-instructions";

it("offers the current installer from the website with installation and recovery steps", () => {
  const html = renderToStaticMarkup(<ThermalSetupInstructions />);
  expect(html).toContain("/downloads/gestion-impresion-windows.zip?v=1.0.5");
  expect(html).toContain('download=""');
  expect(html).toContain("Instalar.vbs");
  expect(html).toContain("recuperarlo");
  expect(html).toContain("Comprobar e imprimir");
  expect(html).toContain("No incluye drivers");
});
