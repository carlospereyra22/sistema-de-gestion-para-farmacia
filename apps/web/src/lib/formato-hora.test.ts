import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// En es-AR, toLocaleString usa reloj de 12 h sin "a. m./p. m.": las 20:14 se
// ven "08:14" y un cierre de caja parecía anterior a su apertura (SISTEMA-104).
// Toda fecha con hora lleva hourCycle: "h23".
const raiz = join(__dirname, "..");

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\./.test(nombre) ? [ruta] : [];
  });
}

describe("horas en formato de 24 h", () => {
  it("12 h sin a. m./p. m. confunde: es-AR necesita hourCycle", () => {
    const tarde = new Date("2026-10-17T23:14:35Z");
    const opciones = { timeZone: "America/Argentina/Buenos_Aires" } as const;
    expect(
      tarde.toLocaleString("es-AR", { ...opciones, hourCycle: "h23" }),
    ).toContain("20:14:35");
  });

  it("ninguna fecha se formatea con es-AR sin reloj de 24 h", () => {
    const sinHourCycle: string[] = [];
    for (const archivo of archivos(raiz)) {
      const texto = readFileSync(archivo, "utf8");
      for (const coincidencia of texto.matchAll(
        /Date\([^)]*\)\s*\.toLocale(?:String|TimeString)\(\s*"es-AR"\s*,?\s*\)/g,
      ))
        sinHourCycle.push(`${archivo}: ${coincidencia[0]}`);
    }
    expect(sinHourCycle).toEqual([]);
  });
});
