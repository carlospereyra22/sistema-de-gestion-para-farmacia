import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import { SinConexionError } from "./api-fetch";
import {
  catalogoAlDia,
  olvidarCatalogoEnMemoria,
  type FuenteDelCatalogo,
  type ProductoDeParte,
} from "./catalogo-local";

const producto = (
  id: string,
  name: string,
  extra: Partial<ProductoDeParte> = {},
): ProductoDeParte => ({
  id,
  name,
  active: true,
  activeIngredient: null,
  pharmaceuticalForm: null,
  concentration: null,
  presentation: null,
  externalReferenceSource: null,
  externalReferenceName: null,
  externalReferencePresentation: null,
  externalReferenceBarcode: null,
  externalReferencePriceMinor: null,
  externalReferenceUpdatedAt: null,
  externalReferenceCheckedAt: null,
  saleUnit: "BOX",
  description: null,
  prescriptionRequired: false,
  barcodes: [],
  prices: [],
  categoryId: null,
  laboratoryId: null,
  ...extra,
});

const diccionario = {
  version: "d1",
  categorias: [
    { id: "c1", name: "Analgésicos", path: "Medicamentos › Analgésicos" },
  ],
  laboratorios: [{ id: "l1", name: "Bagó" }],
};

/** Servidor de prueba: partes con su versión y sus productos. */
function servidor(
  partes: Record<string, { version: string; productos: ProductoDeParte[] }>,
) {
  const fuente = {
    versiones: vi.fn(async (deLaPc?: string) => ({
      partes: Object.fromEntries(
        Object.entries(partes).map(([p, { version }]) => [p, version]),
      ),
      diccionario:
        deLaPc === diccionario.version
          ? { version: diccionario.version }
          : diccionario,
    })),
    partes: vi.fn(async (pedidas: string[]) => ({
      versiones: Object.fromEntries(
        pedidas.map((p) => [p, partes[p]?.version ?? null]),
      ),
      productos: pedidas.flatMap((p) => partes[p]?.productos ?? []),
    })),
  } satisfies FuenteDelCatalogo;
  return fuente;
}

describe("catálogo por partes en la PC (SISTEMA-74)", () => {
  beforeEach(() => {
    usarAlmacen(almacenEnMemoria());
    olvidarCatalogoEnMemoria();
  });

  it("la primera vez baja todo y arma el catálogo ordenado, con categoría y laboratorio", async () => {
    const fuente = servidor({
      "0a": {
        version: "v1",
        productos: [
          producto("0a01", "Ibuprofeno", {
            categoryId: "c1",
            laboratoryId: "l1",
          }),
        ],
      },
      "1f": { version: "v1", productos: [producto("1f01", "Amoxicilina")] },
    });
    const catalogo = await catalogoAlDia("ana", "o1", "b1", fuente);
    expect(catalogo.map((p) => p.name)).toEqual(["Amoxicilina", "Ibuprofeno"]);
    expect(catalogo[1]).toMatchObject({
      category: { id: "c1", path: "Medicamentos › Analgésicos" },
      laboratory: { id: "l1", name: "Bagó" },
    });
    expect(fuente.partes).toHaveBeenCalledWith(["0a", "1f"]);
  });

  it("después sólo baja las partes que cambiaron y no vuelve a pedir el diccionario", async () => {
    const partes = {
      "0a": { version: "v1", productos: [producto("0a01", "Ibuprofeno")] },
      "1f": { version: "v1", productos: [producto("1f01", "Amoxicilina")] },
    };
    const fuente = servidor(partes);
    const primera = await catalogoAlDia("ana", "o1", "b1", fuente);
    // Sin cambios: la misma lista (la pantalla no se redibuja) y ninguna parte.
    fuente.partes.mockClear();
    expect(await catalogoAlDia("ana", "o1", "b1", fuente)).toBe(primera);
    expect(fuente.partes).not.toHaveBeenCalled();
    expect(fuente.versiones).toHaveBeenLastCalledWith("d1");
    // Cambia un producto de la parte 1f.
    partes["1f"] = {
      version: "v2",
      productos: [producto("1f01", "Amoxicilina 500")],
    };
    const segunda = await catalogoAlDia("ana", "o1", "b1", fuente);
    expect(fuente.partes).toHaveBeenCalledWith(["1f"]);
    expect(segunda.map((p) => p.name)).toEqual([
      "Amoxicilina 500",
      "Ibuprofeno",
    ]);
  });

  it("quita las partes que ya no existen", async () => {
    const partes: Record<
      string,
      { version: string; productos: ProductoDeParte[] }
    > = {
      "0a": { version: "v1", productos: [producto("0a01", "Ibuprofeno")] },
      "1f": { version: "v1", productos: [producto("1f01", "Amoxicilina")] },
    };
    const fuente = servidor(partes);
    await catalogoAlDia("ana", "o1", "b1", fuente);
    delete partes["1f"];
    expect(
      (await catalogoAlDia("ana", "o1", "b1", fuente)).map((p) => p.id),
    ).toEqual(["0a01"]);
  });

  it("sin conexión arma el catálogo con lo guardado en la PC", async () => {
    await catalogoAlDia(
      "ana",
      "o1",
      "b1",
      servidor({
        "0a": { version: "v1", productos: [producto("0a01", "Ibuprofeno")] },
      }),
    );
    // Otra pestaña (memoria vacía): sale del almacén de la PC.
    olvidarCatalogoEnMemoria();
    const sinConexion: FuenteDelCatalogo = {
      versiones: () => Promise.reject(new SinConexionError()),
      partes: () => Promise.reject(new SinConexionError()),
    };
    expect(
      (await catalogoAlDia("ana", "o1", "b1", sinConexion)).map((p) => p.name),
    ).toEqual(["Ibuprofeno"]);
  });

  it("sin conexión y sin nada guardado, avisa", async () => {
    await expect(
      catalogoAlDia("ana", "o1", "b1", {
        versiones: () => Promise.reject(new SinConexionError()),
        partes: () => Promise.reject(new SinConexionError()),
      }),
    ).rejects.toBeInstanceOf(SinConexionError);
  });

  it("dos pedidos a la vez comparten la misma actualización", async () => {
    const fuente = servidor({
      "0a": { version: "v1", productos: [producto("0a01", "Ibuprofeno")] },
    });
    const [a, b] = await Promise.all([
      catalogoAlDia("ana", "o1", "b1", fuente),
      catalogoAlDia("ana", "o1", "b1", fuente),
    ]);
    expect(a).toBe(b);
    expect(fuente.versiones).toHaveBeenCalledTimes(1);
  });

  it("cada usuario y cada sucursal tienen su copia", async () => {
    await catalogoAlDia(
      "ana",
      "o1",
      "b1",
      servidor({
        "0a": {
          version: "v1",
          productos: [producto("0a01", "De la sucursal 1")],
        },
      }),
    );
    const otra = await catalogoAlDia(
      "ana",
      "o1",
      "b2",
      servidor({
        "0a": {
          version: "v1",
          productos: [producto("0a02", "De la sucursal 2")],
        },
      }),
    );
    expect(otra.map((p) => p.name)).toEqual(["De la sucursal 2"]);
  });
});
