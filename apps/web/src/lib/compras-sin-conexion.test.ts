import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import { unidadesPendientes, ventasDeLaPc } from "./bandeja-ventas";
import { activarSesionGuardada } from "./cache-local";
import {
  comprasConPendientes,
  detalleConPendientes,
  guardarOperacionCompra,
  lotesConPendientes,
  lotesSinEnviar,
  ingresosDeCompra,
  pedidoDeRecepcion,
  tipoDeCompra,
  type OperacionCompra,
} from "./compras-sin-conexion";
import { aplicarCajaLocal } from "./caja-sin-conexion";
import { historialConPendientes } from "./historial-con-pendientes";

describe("compras sin conexión", () => {
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

  it("reconoce el tipo por la ruta de siempre", () => {
    expect(tipoDeCompra("")).toBe("PEDIDO");
    expect(tipoDeCompra("/direct")).toBe("DIRECTA");
    expect(tipoDeCompra("/p1/receipts/batch")).toBe("RECEPCION");
    expect(pedidoDeRecepcion("/p1/receipts/batch")).toBe("p1");
  });

  it("calcula lo que entra al stock en una compra directa y en una recepción", () => {
    expect(
      ingresosDeCompra(
        {
          path: "/direct",
          body: { receipts: [{ productId: "a", quantity: 3 }] },
        },
        [],
      ),
    ).toEqual([{ productId: "a", cantidad: 3 }]);
    expect(
      ingresosDeCompra(
        {
          path: "/p1/receipts/batch",
          body: { items: [{ itemId: "i1", quantity: 5 }] },
        },
        [{ id: "i1", productId: "b" }],
      ),
    ).toEqual([{ productId: "b", cantidad: 5 }]);
    expect(ingresosDeCompra({ path: "", body: {} }, [])).toEqual([]);
  });

  // Abrir cajas al recibir sin conexión (SISTEMA-103).
  it("lo abierto al recibir entra al producto chico con el mismo lote", () => {
    const apertura = (id: string) =>
      id === "x100" ? { targetProductId: "x10", factor: 10 } : null;
    expect(
      ingresosDeCompra(
        {
          path: "/direct",
          body: {
            receipts: [
              { productId: "x100", quantity: 3, lotNumber: "L1", openBoxes: 2 },
            ],
          },
        },
        [],
        apertura,
      ),
    ).toEqual([
      { productId: "x100", cantidad: 1, lote: "L1", vence: null },
      { productId: "x10", cantidad: 20, lote: "L1", vence: null },
    ]);
    expect(
      ingresosDeCompra(
        {
          path: "/p1/receipts/batch",
          body: {
            items: [
              { itemId: "i1", quantity: 2, lotNumber: "L2", openBoxes: 2 },
            ],
          },
        },
        [{ id: "i1", productId: "x100" }],
        apertura,
      ),
    ).toEqual([{ productId: "x10", cantidad: 20, lote: "L2", vence: null }]);
  });

  it("guarda la recepción en la PC: suma stock y no toca caja ni historial de ventas", async () => {
    await guardarOperacionCompra(
      "o1",
      "b1",
      "/p1/receipts/batch",
      { operationId: "op-1", items: [{ itemId: "i1", quantity: 5 }] },
      [{ productId: "b", cantidad: 5 }],
    );
    const [guardada] = await ventasDeLaPc();
    expect(guardada).toMatchObject({
      id: "op-1",
      operacion: "COMPRA",
      actorName: "Ana",
    });
    expect((guardada!.cuerpo as OperacionCompra).purchaseId).toBe("p1");
    // El stock en pantalla resta lo pendiente: en compras resta negativo.
    expect(unidadesPendientes([guardada!], "o1", "b1").get("b")).toBe(-5);
    expect(aplicarCajaLocal([], [guardada!], "o1", "b1")).toEqual([]);
    expect(historialConPendientes([], [guardada!], "o1", "b1")).toEqual([]);
  });

  it("un pedido creado sin conexión se ve en la lista y se recibe en partes", async () => {
    await guardarOperacionCompra(
      "o1",
      "b1",
      "",
      {
        clientOperationId: "ped-1",
        supplierId: "s1",
        items: [{ productId: "a", quantity: 10, unitCostMinor: 100 }],
      },
      [],
    );
    let bandeja = await ventasDeLaPc();
    const [fila] = comprasConPendientes([], bandeja, "o1", "b1", [
      { id: "s1", name: "Droguería" },
    ]);
    expect(fila).toMatchObject({
      id: "ped-1",
      status: "ORDERED",
      porEnviar: true,
      supplierName: "Droguería",
    });
    // En la PC el renglón se conoce por el producto.
    expect(fila!.items[0]!.id).toBe("a");
    for (const [clave, cantidad] of [
      ["rec-1", 4],
      ["rec-2", 6],
    ] as const)
      await guardarOperacionCompra(
        "o1",
        "b1",
        "/ped-1/receipts/batch",
        { operationId: clave, items: [{ itemId: "a", quantity: cantidad }] },
        [{ productId: "a", cantidad }],
      );
    bandeja = await ventasDeLaPc();
    const recibido = detalleConPendientes(
      "ped-1",
      undefined,
      bandeja,
      "o1",
      "b1",
    );
    expect(recibido?.status).toBe("RECEIVED");
    expect(recibido?.items[0]!.receivedQuantity).toBe(10);
    expect(unidadesPendientes(bandeja, "o1", "b1").get("a")).toBe(-10);
  });

  it("suma la recepción sin conexión a un pedido que ya estaba y no duplica uno que ya llegó", async () => {
    const delServidor = {
      id: "p1",
      clientOperationId: "ped-1",
      createdAt: "2026-11-08T10:00:00.000Z",
      status: "ORDERED" as const,
      supplierId: "s1",
      items: [
        { id: "i1", productId: "a", orderedQuantity: 5, receivedQuantity: 0 },
        { id: "i2", productId: "b", orderedQuantity: 2, receivedQuantity: 0 },
      ],
    };
    await guardarOperacionCompra(
      "o1",
      "b1",
      "",
      { clientOperationId: "ped-1", supplierId: "s1", items: [] },
      [],
    );
    await guardarOperacionCompra(
      "o1",
      "b1",
      "/p1/receipts/batch",
      { operationId: "rec-1", items: [{ itemId: "i1", quantity: 5 }] },
      [{ productId: "a", cantidad: 5 }],
    );
    const filas = comprasConPendientes(
      [delServidor],
      await ventasDeLaPc(),
      "o1",
      "b1",
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      status: "PARTIALLY_RECEIVED",
      porEnviar: true,
    });
    expect(filas[0]!.items.map((i) => i.receivedQuantity)).toEqual([5, 0]);
  });

  it("la próxima recepción reconoce los lotes recibidos sin conexión", async () => {
    const solicitud = {
      path: "/p1/receipts/batch",
      body: {
        operationId: "rec-1",
        items: [
          {
            itemId: "i1",
            quantity: 2,
            lotNumber: " Test 10 ",
            expiresAt: "2027-05-01",
          },
        ],
      },
    };
    await guardarOperacionCompra(
      "o1",
      "b1",
      solicitud.path,
      solicitud.body,
      ingresosDeCompra(solicitud, [{ id: "i1", productId: "a" }]),
    );
    const pendientes = lotesSinEnviar(
      await ventasDeLaPc(),
      "o1",
      "b1",
      "2026-11-08",
    );
    expect(pendientes).toEqual([
      expect.objectContaining({
        productId: "a",
        number: "Test 10",
        quantity: 2,
        expiresAt: "2027-05-01",
        expiryStatus: "AVAILABLE",
      }),
    ]);
    // Si el lote ya existía en el servidor, se suma a ese.
    expect(
      lotesConPendientes(
        [
          {
            id: "l1",
            productId: "a",
            number: "Test 10",
            quantity: 5,
            expiresAt: "2027-05-01",
            expiryStatus: "AVAILABLE" as const,
          },
        ],
        pendientes,
      ),
    ).toEqual([expect.objectContaining({ id: "l1", quantity: 7 })]);
  });
});
