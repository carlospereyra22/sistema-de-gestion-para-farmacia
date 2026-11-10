import { beforeEach, describe, expect, it, vi } from "vitest";
import { olvidarPrecarga, precargarModulos } from "./precargar-modulos";

describe("precargarModulos", () => {
  beforeEach(() => olvidarPrecarga());

  it("baja cada parte una sola vez por pestaña, aunque se pida varias veces", async () => {
    const a = vi.fn(async () => ({}));
    const b = vi.fn(async () => ({}));
    const bajar = vi.fn(async () => undefined);
    await Promise.all([
      precargarModulos([a, b], bajar),
      precargarModulos([a, b], bajar),
    ]);
    await precargarModulos([a, b], bajar);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // También el worker del lector de PDF.
    expect(bajar).toHaveBeenCalledTimes(1);
  });

  it("una parte que falla no frena a las demás", async () => {
    const falla = vi.fn(async () => {
      throw new Error("sin conexión");
    });
    const sigue = vi.fn(async () => ({}));
    await precargarModulos([falla, sigue], async () => undefined);
    expect(sigue).toHaveBeenCalled();
  });
});
