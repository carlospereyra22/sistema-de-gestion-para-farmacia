import { describe, expect, it, vi } from "vitest";
import {
  aplicarTema,
  CLAVE_TEMA,
  COLOR_BARRA,
  guardarTema,
  leerTema,
} from "./tema";

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
  };
}

function documento(oscuro = false) {
  const clases = new Set(oscuro ? ["dark"] : []);
  const barra = { setAttribute: vi.fn() };
  return {
    clases,
    barra,
    doc: {
      documentElement: {
        classList: {
          contains: (c: string) => clases.has(c),
          add: (c: string) => void clases.add(c),
          remove: (c: string) => void clases.delete(c),
          toggle: (c: string, activa?: boolean) => {
            if (activa ?? !clases.has(c)) clases.add(c);
            else clases.delete(c);
            return clases.has(c);
          },
        } as unknown as DOMTokenList,
      },
      querySelector: () => barra as unknown as Element,
    },
  };
}

describe("tema guardado en el navegador", () => {
  it("arranca en claro si la PC nunca eligió tema", () => {
    expect(leerTema(almacen())).toBe("claro");
    expect(leerTema(undefined)).toBe("claro");
  });

  it("recuerda el modo oscuro elegido en esta PC", () => {
    const local = almacen();
    guardarTema(local, "oscuro");
    expect(local.getItem(CLAVE_TEMA)).toBe("oscuro");
    expect(leerTema(local)).toBe("oscuro");
  });

  it("ignora valores desconocidos y almacenamiento bloqueado", () => {
    expect(leerTema(almacen({ [CLAVE_TEMA]: "azul" }))).toBe("claro");
    const bloqueado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(leerTema(bloqueado)).toBe("claro");
    expect(() => guardarTema(bloqueado, "oscuro")).not.toThrow();
  });
});

describe("aplicar el tema a la página", () => {
  it("pone la clase dark, cambia la barra del navegador y apaga las transiciones un instante", () => {
    const { doc, clases, barra } = documento();
    let terminar = () => {};
    aplicarTema(doc, "oscuro", (listo) => (terminar = listo));
    expect(clases.has("dark")).toBe(true);
    expect(clases.has("cambiando-tema")).toBe(true);
    expect(barra.setAttribute).toHaveBeenCalledWith(
      "content",
      COLOR_BARRA.oscuro,
    );
    terminar();
    expect(clases.has("cambiando-tema")).toBe(false);
  });

  it("vuelve a claro y no hace nada si el tema ya está aplicado", () => {
    const { doc, clases, barra } = documento(true);
    aplicarTema(doc, "oscuro", (listo) => listo());
    expect(barra.setAttribute).not.toHaveBeenCalled();
    aplicarTema(doc, "claro", (listo) => listo());
    expect(clases.has("dark")).toBe(false);
    expect(barra.setAttribute).toHaveBeenCalledWith(
      "content",
      COLOR_BARRA.claro,
    );
  });
});
