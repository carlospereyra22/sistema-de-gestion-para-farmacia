import { describe, expect, it } from "vitest";
import {
  armarEntrada,
  erroresPaso,
  fechaIso,
  fechaLocal,
  formularioVacio,
  pesosAMinor,
  porcentajeABps,
  vistaPrevia,
} from "./oferta-formulario";

const producto = {
  kind: "PRODUCT" as const,
  id: "p1",
  name: "Ibuprofeno",
  exclude: false,
  quantity: "",
};

describe("formulario de ofertas", () => {
  it("convierte importes argentinos y porcentajes sin decimales flotantes", () => {
    expect(pesosAMinor("1.500,50")).toBe(150050);
    expect(pesosAMinor("$ 1500")).toBe(150000);
    expect(pesosAMinor("12.5")).toBe(1250);
    expect(pesosAMinor("abc")).toBeNull();
    expect(porcentajeABps("12,5")).toBe(1250);
    expect(porcentajeABps("100")).toBe(10000);
    expect(porcentajeABps("150")).toBeNull();
  });

  it("usa la hora de Argentina en la vigencia", () => {
    expect(fechaIso("2026-11-10T09:00")).toBe("2026-11-10T12:00:00.000Z");
    expect(fechaLocal("2026-11-10T12:00:00.000Z")).toBe("2026-11-10T09:00");
  });

  it("arma un martes 10% de 9 a 12 en los productos elegidos", () => {
    const formulario = {
      ...formularioVacio(new Date("2026-11-10T12:00:00Z"), [producto]),
      name: "Martes 10%",
      porcentaje: "10",
      dias: [2],
      horaDesde: "09:00",
      horaHasta: "12:00",
    };
    expect(armarEntrada(formulario)).toMatchObject({
      type: "PERCENT",
      percentBps: 1000,
      weekdays: 4,
      dayStartMinute: 540,
      dayEndMinute: 720,
      targets: [{ kind: "PRODUCT", id: "p1", exclude: false }],
    });
  });

  it("guía por pasos con mensajes claros", () => {
    const vacio = formularioVacio();
    expect(erroresPaso(vacio, "tipo")).toContain("nombre");
    expect(erroresPaso(vacio, "productos")).toContain("al menos un producto");
    expect(
      erroresPaso(
        { ...vacio, type: "BUY_X_PAY_Y", lleva: "2", paga: "2" },
        "parametros",
      ),
    ).toContain("Paga tiene que ser menos");
  });

  it("vista previa: un producto de $10.000 queda en $8.000", () => {
    const entrada = armarEntrada({
      ...formularioVacio(new Date(), [producto]),
      name: "Veinte",
      porcentaje: "20",
    });
    if (typeof entrada === "string") throw new Error(entrada);
    expect(vistaPrevia(entrada, 1_000_000)?.texto).toBe(
      "Un producto de $10.000 queda en $8.000.",
    );
  });

  it("vista previa de un 2x1 y de un combo", () => {
    const dosPorUno = armarEntrada({
      ...formularioVacio(new Date(), [producto]),
      name: "2x1",
      type: "BUY_X_PAY_Y",
    });
    if (typeof dosPorUno === "string") throw new Error(dosPorUno);
    expect(vistaPrevia(dosPorUno, 500_000)?.texto).toBe(
      "Llevando 2 de $5.000 pagás $5.000 en lugar de $10.000.",
    );
    const combo = armarEntrada({
      ...formularioVacio(new Date(), [
        { ...producto, id: "a", quantity: "1" },
        { ...producto, id: "b", quantity: "1" },
      ]),
      name: "Combo",
      type: "BUNDLE",
      precio: "9000",
    });
    if (typeof combo === "string") throw new Error(combo);
    expect(
      vistaPrevia(
        combo,
        0,
        new Map([
          ["a", 600_000],
          ["b", 500_000],
        ]),
      )?.texto,
    ).toBe("El combo de $11.000 queda en $9.000.");
  });
});
