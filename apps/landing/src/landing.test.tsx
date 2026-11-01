import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "./landing";
import { site, whatsappUrl } from "./site";

const html = renderToStaticMarkup(<Landing />);

describe("landing", () => {
  it("tiene todas las secciones del menu", () => {
    for (const id of [
      "inicio",
      "beneficios",
      "funciones",
      "como-empezar",
      "preguntas",
      "contacto",
    ])
      expect(html).toContain(`id="${id}"`);
  });

  it("Ingresar lleva al sistema", () => {
    expect(html).toContain(`href="${site.appUrl}"`);
    expect(html).toContain("Ingresar al sistema");
  });

  it("Pedi una demo y el boton flotante abren WhatsApp con el mensaje", () => {
    expect(whatsappUrl()).toBe(
      `https://wa.me/${site.contact.whatsapp}?text=Hola%2C%20quiero%20conocer%20Farmatec%20para%20mi%20farmacia.`,
    );
    expect(html).toContain('aria-label="Escribinos por WhatsApp"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("no muestra cifras ni monedas inventadas", () => {
    expect(html).not.toMatch(/\$\s?\d/);
    expect(html).not.toContain("MXN");
  });

  it("es accesible con teclado: salto al contenido y menu con aria", () => {
    expect(html).toContain("Saltar al contenido");
    expect(html).toContain('aria-label="Abrir menú"');
  });
});
