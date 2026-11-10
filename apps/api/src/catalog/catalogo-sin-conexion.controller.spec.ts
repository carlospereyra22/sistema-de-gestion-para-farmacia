import { randomUUID } from "node:crypto";
import { CatalogOfflineController } from "./catalogo-sin-conexion.controller";
import type { CatalogOfflineService } from "./catalogo-sin-conexion.service";
import { InventoryController } from "../inventory/inventory.controller";
import type { InventoryService } from "../inventory/inventory.service";
import type { AuthenticatedRequest } from "../auth/auth.types";

// SISTEMA-79: lo que guarda la PC sin conexión pasa la misma validación que
// con conexión, según su tipo.
const req = { auth: { sub: "actor" } } as AuthenticatedRequest;
const base = () => ({
  clientOperationId: randomUUID(),
  occurredAt: new Date().toISOString(),
  deviceId: randomUUID(),
});

describe("validación de productos sin conexión", () => {
  const service = { catalogOffline: jest.fn().mockResolvedValue({}) };
  const controller = new CatalogOfflineController(
    service as unknown as CatalogOfflineService,
  );
  const enviar = (body: Record<string, unknown>) =>
    controller.offlineOperation("org", "branch", req, body as never);

  it("acepta el alta, la edición parcial, el estado y los códigos", async () => {
    await enviar({
      ...base(),
      tipo: "ALTA",
      cuerpo: { name: "Paracetamol", priceMinor: 800, barcode: "779002" },
    });
    await enviar({
      ...base(),
      tipo: "EDICION",
      productId: randomUUID(),
      cuerpo: { name: "Paracetamol 500", priceMinor: 900 },
    });
    await enviar({
      ...base(),
      tipo: "ESTADO_SUCURSAL",
      productId: randomUUID(),
      cuerpo: {
        status: "ARCHIVED",
        expectedStatus: "ACTIVE",
        expectedUpdatedAt: null,
        reason: "Sin venta",
      },
    });
    await enviar({
      ...base(),
      tipo: "OPCION",
      cuerpo: { type: "laboratories", name: "Bagó" },
    });
    expect(service.catalogOffline).toHaveBeenCalledTimes(4);
  });

  it("rechaza campos que no son del tipo y la falta del producto", async () => {
    await expect(
      enviar({
        ...base(),
        tipo: "EDICION",
        productId: randomUUID(),
        cuerpo: { name: "X", inventado: true },
      }),
    ).rejects.toThrow("datos inválidos");
    await expect(
      enviar({ ...base(), tipo: "CODIGO_AGREGAR", cuerpo: { code: "1" } }),
    ).rejects.toThrow("datos inválidos");
  });
});

describe("validación de inventario sin conexión", () => {
  const service = { inventoryOffline: jest.fn().mockResolvedValue({}) };
  const controller = new InventoryController(
    service as unknown as InventoryService,
  );
  const enviar = (body: Record<string, unknown>) =>
    controller.offline(req, "org", "branch", body as never);

  it("acepta ingresos y salidas nombrando el lote por id o por producto y número", async () => {
    await enviar({
      ...base(),
      tipo: "INGRESO",
      cuerpo: {
        productId: randomUUID(),
        supplierId: null,
        lotNumber: "A1",
        quantity: 5,
        unitCostMinor: 100,
      },
    });
    await enviar({
      ...base(),
      tipo: "AJUSTE",
      cuerpo: {
        lote: { productId: randomUUID(), number: "A1" },
        quantity: -2,
        reason: "Rotura",
        supplierId: null,
      },
    });
    await enviar({
      ...base(),
      tipo: "EDICION_LOTE",
      cuerpo: {
        lote: { lotId: randomUUID() },
        expiresAt: null,
        reason: "Corrección",
      },
    });
    expect(service.inventoryOffline).toHaveBeenCalledTimes(3);
  });

  it("rechaza una salida sin lote", async () => {
    await expect(
      enviar({
        ...base(),
        tipo: "DEVOLUCION",
        cuerpo: { lote: {}, supplierId: null, quantity: 1, reason: "Vencido" },
      }),
    ).rejects.toThrow("datos inválidos");
  });
});
