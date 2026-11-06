import { describe, expect, it } from "vitest";
import { selectListPlacement } from "./select-list-placement";

describe("ubicación de la lista de un selector", () => {
  it("abre hacia abajo cuando la lista entra completa", () => {
    expect(selectListPlacement(5, 300, 40)).toEqual({
      above: false,
      maxHeight: 224,
    });
  });

  it("abre hacia arriba cuando abajo no entra y arriba hay más lugar", () => {
    // Registrar pago en una ventana baja: 5 opciones y 190 px libres abajo.
    expect(selectListPlacement(5, 190, 271)).toEqual({
      above: true,
      maxHeight: 224,
    });
  });

  it("una lista corta no se da vuelta si entra abajo", () => {
    expect(selectListPlacement(3, 150, 400).above).toBe(false);
  });

  it("achica la lista cuando no entra de ningún lado", () => {
    expect(selectListPlacement(10, 120, 170)).toEqual({
      above: true,
      maxHeight: 148,
    });
  });

  it("siempre deja al menos dos opciones visibles", () => {
    expect(selectListPlacement(10, 30, 20).maxHeight).toBe(80);
  });
});
