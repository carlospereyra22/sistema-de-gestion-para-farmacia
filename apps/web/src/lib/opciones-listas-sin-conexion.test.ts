import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import type { CatalogProduct } from "./api";
import { ventasDeLaPc } from "./bandeja-ventas";
import { activarSesionGuardada } from "./cache-local";
import {
  guardarOperacionCatalogo,
  listasConPendientes,
  logoPendiente,
  opcionesConPendientes,
  operacionCatalogoTexto,
  precioAjustado,
  preciosPendientesDeLista,
  productosConPendientes,
} from "./catalogo-sin-conexion";
import { textoAviso } from "./avisos-sincronizacion";

const opciones = {
  categories: [
    { id: "med", name: "Medicamentos", parentId: null, path: "Medicamentos" },
    {
      id: "anal",
      name: "Analgésicos",
      parentId: "med",
      path: "Medicamentos › Analgésicos",
    },
  ],
  laboratories: [{ id: "bago", name: "Bagó", logoUpdatedAt: null }],
};

const producto = {
  id: "p1",
  name: "Ibuprofeno",
  category: {
    id: "anal",
    name: "Analgésicos",
    path: "Medicamentos › Analgésicos",
  },
  laboratory: { id: "bago", name: "Bagó" },
  barcodes: [],
  prices: [{ amountMinor: "1000" }],
} as unknown as CatalogProduct;

const listas = [
  {
    id: "general",
    name: "Precio general",
    prices: [
      { productId: "p1", amountMinor: "1000" },
      { productId: "p2", amountMinor: "2000" },
    ],
  },
  {
    id: "may",
    name: "Mayorista",
    prices: [{ productId: "p1", amountMinor: "900" }],
  },
];

describe("categorías, laboratorios y listas sin conexión (SISTEMA-80)", () => {
  beforeEach(async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    usarAlmacen(almacenEnMemoria());
    await activarSesionGuardada({
      alcance: "ana@farmacia.com",
      perfil: {
        email: "ana@farmacia.com",
        organizations: [{ organizationId: "o1", displayName: "Ana" }],
      },
      ultimaSincronizacion: Date.now(),
    });
  });

  it("renombrar y mover una categoría se ve en las opciones (con su ruta) y en los productos", async () => {
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "OPCION_EDICION",
      cuerpo: { type: "categories", id: "anal", name: "Dolor", parentId: null },
    });
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "OPCION_ICONO",
      cuerpo: { id: "med", icon: "pill", color: "blue" },
    });
    const bandeja = await ventasDeLaPc();
    const r = opcionesConPendientes(opciones, bandeja, "o1");
    expect(r.categories.find((c) => c.id === "anal")).toMatchObject({
      name: "Dolor",
      parentId: null,
      path: "Dolor",
    });
    expect(r.categories.find((c) => c.id === "med")).toMatchObject({
      icon: "pill",
      color: "blue",
    });
    // El original no se toca.
    expect(opciones.categories[1]?.name).toBe("Analgésicos");
    const [p] = productosConPendientes(
      [producto],
      bandeja,
      "o1",
      "b1",
      opciones,
    );
    expect(p?.category).toMatchObject({
      id: "anal",
      name: "Dolor",
      path: "Dolor",
    });
    expect(operacionCatalogoTexto(bandeja[0]!)).toBe(
      "Categoría editado · Dolor",
    );
  });

  it("eliminar un laboratorio lo saca de las opciones y de sus productos; el logo nuevo se ve", async () => {
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "LOGO",
      cuerpo: { id: "bago", dataUrl: "data:image/png;base64,AAA" },
    });
    expect(logoPendiente(await ventasDeLaPc(), "o1", "bago")).toBe(
      "data:image/png;base64,AAA",
    );
    expect(
      opcionesConPendientes(opciones, await ventasDeLaPc(), "o1")
        .laboratories[0]?.logoUpdatedAt,
    ).toBeTruthy();
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "OPCION_BAJA",
      cuerpo: { type: "laboratories", id: "bago" },
    });
    const bandeja = await ventasDeLaPc();
    expect(opcionesConPendientes(opciones, bandeja, "o1").laboratories).toEqual(
      [],
    );
    expect(
      productosConPendientes([producto], bandeja, "o1", "b1", opciones)[0]
        ?.laboratory,
    ).toBeNull();
  });

  it("listas: la nueva con todos los productos, nombres y precios cambiados", async () => {
    await guardarOperacionCatalogo(
      "o1",
      "b1",
      {
        tipo: "LISTA_ALTA",
        cuerpo: { name: " Obra social ", includeAll: true },
      },
      "os",
    );
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "LISTA_EDICION",
      cuerpo: {
        priceListId: "may",
        name: "Mayoristas",
        fallbackPriceListId: "os",
      },
    });
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "LISTA_PRECIOS",
      cuerpo: {
        priceListId: "may",
        changes: [
          { productId: "p1", expectedMinor: "900", amountMinor: "950" },
          { productId: "p2", expectedMinor: null, amountMinor: "1800" },
        ],
      },
    });
    const bandeja = await ventasDeLaPc();
    const r = listasConPendientes(listas, bandeja, "o1");
    expect(r.map((l) => l.name)).toEqual([
      "Mayoristas",
      "Obra social",
      "Precio general",
    ]);
    expect(r.find((l) => l.id === "os")?.prices).toEqual(listas[0]!.prices);
    expect(r.find((l) => l.id === "may")).toMatchObject({
      fallbackPriceListId: "os",
      prices: [
        { productId: "p1", amountMinor: "950" },
        { productId: "p2", amountMinor: "1800" },
      ],
    });
    expect([...preciosPendientesDeLista(bandeja, "o1", "may")]).toEqual([
      ["p1", "950"],
      ["p2", "1800"],
    ]);
    // Sin nada pendiente, la misma lista (no se redibuja).
    expect(listasConPendientes(listas, [], "o1")).toBe(listas);
  });

  it("la vista previa sin conexión ajusta como el servidor", () => {
    expect(precioAjustado(1000n, "PERCENT", 800)).toBe(1080n);
    expect(precioAjustado(999n, "PERCENT", 50)).toBe(1004n);
    expect(precioAjustado(1000n, "FIXED", -250)).toBe(750n);
    expect(() => precioAjustado(1000n, "PERCENT", -10001)).toThrow("100%");
    expect(() => precioAjustado(100n, "FIXED", -200)).toThrow("negativo");
  });

  it("avisos de nombres repetidos y precios cambiados en otra PC", () => {
    expect(
      textoAviso({
        kind: "NOMBRE_REPETIDO",
        detail: { nombre: "Bebés", tipo: "categoría" },
      }).titulo,
    ).toBe("Nombre ya usado: Bebés");
    const precios = textoAviso({
      kind: "DATO_PISADO",
      detail: { nombre: "Mayorista", lista: "Mayorista" },
    });
    expect(precios.titulo).toBe("Precios cambiados en otra PC: Mayorista");
    expect(
      textoAviso({
        kind: "OPCION_EXISTENTE",
        detail: { nombre: "Mayorista", tipo: "lista de precios" },
      }).titulo,
    ).toBe("Lista de precios que ya existía: Mayorista");
  });
});
