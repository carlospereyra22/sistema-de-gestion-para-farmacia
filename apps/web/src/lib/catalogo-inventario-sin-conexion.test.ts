import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import type { CatalogProduct, StockLot } from "./api";
import { ventasDeLaPc } from "./bandeja-ventas";
import { activarSesionGuardada } from "./cache-local";
import {
  camposCambiadosDelProducto,
  guardarOperacionCatalogo,
  opcionesConPendientes,
  operacionCatalogoTexto,
  productoConPendientes,
  productosConPendientes,
} from "./catalogo-sin-conexion";
import {
  guardarOperacionInventario,
  idDeLoteDeLaPc,
  loteConPendientes,
  loteDeLaOperacion,
  operacionInventarioTexto,
  stockConPendientes,
} from "./inventario-sin-conexion";

const ibuprofeno: CatalogProduct = {
  id: "p1",
  name: "Ibuprofeno 400",
  active: true,
  activeIngredient: "Ibuprofeno",
  pharmaceuticalForm: null,
  concentration: null,
  presentation: "x 10",
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
  category: { id: "c1", name: "Analgésicos" },
  laboratory: null,
  barcodes: [{ code: "779001", primary: true, kind: "PACKAGE" }],
  prices: [{ amountMinor: "1000" }],
  branchStatus: "ACTIVE",
};

const lote: StockLot = {
  id: "l1",
  productId: "p1",
  productName: "Ibuprofeno 400",
  number: "A1",
  quantity: 10,
  expiresAt: "2099-01-01T00:00:00.000Z",
  metadataVersion: 0,
  sellableQuantity: 10,
  expiredQuantity: 0,
  expiryStatus: "AVAILABLE",
};

describe("productos e inventario sin conexión (SISTEMA-79)", () => {
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

  it("el alta se ve enseguida en el catálogo, por enviar y con el id de la PC", async () => {
    const op = await guardarOperacionCatalogo(
      "o1",
      "b1",
      {
        tipo: "ALTA",
        cuerpo: {
          name: " Paracetamol 500 ",
          barcode: "779002",
          priceMinor: 800,
          categoryId: "c1",
          equivalentBarcodes: ["779009"],
        },
      },
      "nuevo",
    );
    expect(op.clientOperationId).toBe("nuevo");
    const bandeja = await ventasDeLaPc();
    expect(bandeja[0]).toMatchObject({
      operacion: "CATALOGO",
      actorName: "Ana",
    });
    const catalogo = productosConPendientes([ibuprofeno], bandeja, "o1", "b1");
    const nuevo = catalogo.find((p) => p.id === "nuevo");
    expect(nuevo).toMatchObject({
      name: "Paracetamol 500",
      porEnviar: true,
      branchStatus: "ACTIVE",
      category: { id: "c1", name: "Analgésicos" },
      prices: [{ amountMinor: "800" }],
    });
    expect(nuevo?.barcodes.map((b) => [b.code, b.kind])).toEqual([
      ["779002", "PACKAGE"],
      ["779009", "EQUIVALENT"],
    ]);
    expect(productoConPendientes(bandeja, "o1", "nuevo")).toBe(true);
    expect(productoConPendientes(bandeja, "o1", "p1")).toBe(false);
    expect(operacionCatalogoTexto(bandeja[0]!)).toBe(
      "Alta de producto · Paracetamol 500",
    );
    // Sin nada pendiente, el catálogo es el mismo (no se redibuja).
    const vacio: never[] = [];
    expect(productosConPendientes([ibuprofeno], vacio, "o1", "b1")[0]).toBe(
      ibuprofeno,
    );
  });

  it("la edición sólo manda lo que cambió y se ve aplicada", async () => {
    const cambios = camposCambiadosDelProducto(ibuprofeno, {
      name: "Ibuprofeno 400 mg",
      activeIngredient: " Ibuprofeno ",
      presentation: "x 10",
      barcode: "779001",
      priceMinor: 1200,
      categoryId: "c1",
      laboratoryId: null,
      saleUnit: "BOX",
      description: "",
      prescriptionRequired: false,
      pharmaceuticalForm: "",
      concentration: "",
    });
    expect(cambios).toEqual({ name: "Ibuprofeno 400 mg", priceMinor: 1200 });
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "EDICION",
      productId: "p1",
      cuerpo: cambios,
    });
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "CODIGO_AGREGAR",
      productId: "p1",
      cuerpo: { code: "779099" },
    });
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "ESTADO_SUCURSAL",
      productId: "p1",
      cuerpo: {
        status: "ARCHIVED",
        expectedStatus: "ACTIVE",
        reason: "Sin venta",
      },
    });
    const bandeja = await ventasDeLaPc();
    const [p] = productosConPendientes([ibuprofeno], bandeja, "o1", "b1");
    expect(p).toMatchObject({
      name: "Ibuprofeno 400 mg",
      prices: [{ amountMinor: "1200" }],
      branchStatus: "ARCHIVED",
      porEnviar: true,
    });
    expect(p?.barcodes.map((b) => b.code)).toEqual(["779001", "779099"]);
    // El estado es de esa sucursal: en otra no cambia.
    expect(
      productosConPendientes([ibuprofeno], bandeja, "o1", "otra")[0]
        ?.branchStatus,
    ).toBe("ACTIVE");
    // El original no se toca.
    expect(ibuprofeno.name).toBe("Ibuprofeno 400");
  });

  it("eliminar lo saca del catálogo; una categoría nueva aparece en las opciones", async () => {
    await guardarOperacionCatalogo(
      "o1",
      "b1",
      {
        tipo: "OPCION",
        cuerpo: { type: "categories", name: "Dermo", parentId: "c1" },
      },
      "cat",
    );
    await guardarOperacionCatalogo("o1", "b1", {
      tipo: "ELIMINAR",
      productId: "p1",
      cuerpo: {},
    });
    const bandeja = await ventasDeLaPc();
    expect(productosConPendientes([ibuprofeno], bandeja, "o1", "b1")).toEqual(
      [],
    );
    const opciones = opcionesConPendientes(
      {
        categories: [{ id: "c1", name: "Analgésicos", path: "Analgésicos" }],
        laboratories: [],
      },
      bandeja,
      "o1",
    );
    expect(opciones.categories.at(-1)).toMatchObject({
      id: "cat",
      name: "Dermo",
      parentId: "c1",
      path: "Analgésicos › Dermo",
    });
  });

  it("el stock suma ingresos y descuenta ajustes y devoluciones, nunca en negativo", async () => {
    await guardarOperacionInventario("o1", "b1", {
      tipo: "INGRESO",
      cuerpo: {
        productId: "p1",
        supplierId: null,
        lotNumber: "A1",
        quantity: 5,
        unitCostMinor: 100,
      },
    });
    await guardarOperacionInventario("o1", "b1", {
      tipo: "INGRESO",
      cuerpo: {
        productId: "p2",
        supplierId: "s1",
        lotNumber: "N1",
        quantity: 3,
        unitCostMinor: 200,
        expiresAt: "2000-01-01",
      },
    });
    await guardarOperacionInventario("o1", "b1", {
      tipo: "AJUSTE",
      cuerpo: { lote: { lotId: "l1" }, quantity: -4, reason: "Rotura" },
    });
    await guardarOperacionInventario("o1", "b1", {
      tipo: "DEVOLUCION",
      cuerpo: {
        lote: loteDeLaOperacion(idDeLoteDeLaPc("p2", "N1")),
        supplierId: "s1",
        quantity: 10,
        reason: "Vencido",
      },
    });
    const bandeja = await ventasDeLaPc();
    const stock = stockConPendientes([lote], bandeja, "o1", "b1", (id) =>
      id === "p2" ? "Gasa" : undefined,
    );
    expect(stock.map((l) => [l.id, l.quantity, l.porEnviar])).toEqual([
      ["l1", 11, true],
    ]);
    // El lote nuevo quedó en cero por la devolución: no se muestra.
    expect(loteConPendientes(bandeja, "o1", "b1", "l1")).toBe(true);
    expect(loteConPendientes(bandeja, "o1", "b1", "otro")).toBe(false);
    expect(
      loteConPendientes(bandeja, "o1", "b1", idDeLoteDeLaPc("p9", "X")),
    ).toBe(true);
    expect(bandeja.map(operacionInventarioTexto)).toEqual([
      "Ingreso de 5 un. · lote A1",
      "Ingreso de 3 un. · lote N1",
      "Ajuste de -4 un.",
      "Devolución al proveedor · 10 un.",
    ]);
  });

  it("un lote nuevo de la PC tiene nombre, vencimiento y disponibilidad calculados", async () => {
    await guardarOperacionInventario("o1", "b1", {
      tipo: "INGRESO",
      cuerpo: {
        productId: "p2",
        supplierId: null,
        lotNumber: " N2 ",
        quantity: 3,
        unitCostMinor: 200,
        expiresAt: "2000-01-01",
      },
    });
    await guardarOperacionInventario("o1", "b1", {
      tipo: "EDICION_LOTE",
      cuerpo: {
        lote: { productId: "p2", number: "N2" },
        number: "N3",
        reason: "Corrección",
      },
    });
    const stock = stockConPendientes(
      [],
      await ventasDeLaPc(),
      "o1",
      "b1",
      () => "Gasa",
    );
    expect(stock[0]).toMatchObject({
      id: idDeLoteDeLaPc("p2", "N2"),
      productName: "Gasa",
      number: "N3",
      expiryStatus: "EXPIRED",
      sellableQuantity: 0,
      expiredQuantity: 3,
      porEnviar: true,
    });
    expect(loteDeLaOperacion(idDeLoteDeLaPc("p2", "N2"))).toEqual({
      productId: "p2",
      number: "N2",
    });
    expect(loteDeLaOperacion("l1")).toEqual({ lotId: "l1" });
  });
});
