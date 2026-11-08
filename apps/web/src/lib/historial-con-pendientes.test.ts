import { describe, expect, it } from "vitest";
import type { Sale } from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import { historialConPendientes } from "./historial-con-pendientes";

const pendiente = (id: string, datos: Partial<VentaPendiente> = {}) =>
  ({
    version: 1,
    id,
    alcance: "ana@farmacia.com",
    organizationId: "o1",
    branchId: "b1",
    occurredAt: "2026-11-08T15:00:00.000Z",
    totalMinor: "1500",
    documentType: "INTERNAL",
    cuerpo: {
      customerId: "c1",
      items: [
        {
          productId: "p1",
          quantity: 2,
          discountMinor: 0,
          expectedUnitPriceMinor: "750",
        },
      ],
      payments: [{ method: "CASH", amountMinor: 1500 }],
    },
    unidades: [],
    estado: "PENDIENTE",
    intentos: 0,
    ...datos,
  }) as VentaPendiente;

const delServidor = (id: string, completedAt: string): Sale => ({
  id,
  status: "COMPLETED",
  totalMinor: "100",
  completedAt,
  items: [],
  payments: [],
});

describe("historial con las ventas sin enviar", () => {
  it("muestra lo vendido sin internet junto a lo que tenía el servidor, lo más nuevo arriba", () => {
    const historial = historialConPendientes(
      [delServidor("vieja", "2026-11-08T10:00:00.000Z")],
      [pendiente("nueva")],
      "o1",
      "b1",
    );
    expect(historial.map((venta) => venta.id)).toEqual(["nueva", "vieja"]);
    expect(historial[0]).toMatchObject({
      porEnviar: true,
      customerId: "c1",
      totalMinor: "1500",
      items: [{ productId: "p1", quantity: 2, unitPriceMinor: "750" }],
      payments: [{ method: "CASH", amountMinor: "1500" }],
    });
  });

  it("no repite una que ya llegó ni muestra otras sucursales o ya enviadas", () => {
    const historial = historialConPendientes(
      [delServidor("llego", "2026-11-08T16:00:00.000Z")],
      [
        pendiente("llego"),
        pendiente("otra-sucursal", { branchId: "b2" }),
        pendiente("enviada", { estado: "ENVIADA" }),
        pendiente("de-beto", { alcance: "beto@farmacia.com" }),
      ],
      "o1",
      "b1",
    );
    expect(historial.map((venta) => venta.id)).toEqual(["llego", "de-beto"]);
  });
});
