import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// El título de la pestaña salía "CatÃ¡logo": el archivo tenía las tildes
// guardadas dos veces como UTF-8 (SISTEMA-121).
describe("index.html del catálogo", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

  it("el título se lee bien", () => {
    expect(html).toContain("<title>Catálogo</title>");
  });

  it("no tiene letras con la codificación rota", () => {
    expect(html).not.toMatch(/Ã[\u0080-¿]/);
  });
});
