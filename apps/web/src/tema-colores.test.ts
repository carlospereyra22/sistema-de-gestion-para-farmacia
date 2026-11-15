import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// Modo oscuro (SISTEMA-105): los colores salen de variables que cambian con el
// tema. Un hex suelto en una clase (`bg-[#e8faf5]`) queda igual en oscuro.
const src = fileURLToPath(new URL(".", import.meta.url));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)
      ? [ruta]
      : [];
  });
}

it("las clases de Tailwind no usan colores hex sueltos", () => {
  const conHex = archivos(src).filter((ruta) =>
    /-\[[^\]\s"]*#[0-9a-fA-F]{3,8}\b/.test(readFileSync(ruta, "utf8")),
  );
  expect(conHex).toEqual([]);
});

it("cada color propio del tema tiene su par en modo oscuro", () => {
  const tema = readFileSync(join(src, "tema.css"), "utf8");
  const oscuro = readFileSync(join(src, "tema-oscuro.css"), "utf8");
  const propios = [...tema.matchAll(/(--color-[a-z0-9-]+):\s*#/g)].map(
    (m) => m[1],
  );
  expect(propios.length).toBeGreaterThan(50);
  const faltan = propios.filter(
    (variable) => !oscuro.includes(`${variable}: oklch(`),
  );
  expect(faltan).toEqual([]);
  expect(oscuro).toContain("--color-white: oklch(");
});

it("index.css no usa hex ni white: todo pasa por variables del tema", () => {
  const css = readFileSync(join(src, "index.css"), "utf8");
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(css).not.toMatch(/:\s*white\b/);
});
