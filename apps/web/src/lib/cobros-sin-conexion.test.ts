import { describe, expect, it } from "vitest";
import type { CashSession } from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import {
  aplicarCajaLocal,
  cobrosConPendientes,
  type OperacionCaja,
} from "./caja-sin-conexion";

const op = (
  id: string,
  minutos: number,
  cuerpo: Omit<OperacionCaja, "clientOperationId" | "occurredAt" | "deviceId">,
): VentaPendiente =>
  ({
    version: 1,
    id,
    alcance: "ana@farmacia.com",
    organizationId: "o1",
    branchId: "b1",
    occurredAt: new Date(Date.UTC(2026, 10, 10, 12, minutos)).toISOString(),
    totalMinor: "0",
    documentType: "INTERNAL",
    cuerpo: {
      ...cuerpo,
      clientOperationId: id,
      occurredAt: new Date(Date.UTC(2026, 10, 10, 12, minutos)).toISOString(),
      deviceId: "pc",
    },
    unidades: [],
    estado: "PENDIENTE",
    intentos: 0,
    operacion: "CAJA",
    actorName: "Ana",
  }) as VentaPendiente;

const sesion = {
  id: "s1",
  cashRegisterId: "r1",
  openedAt: "2026-11-10T11:00:00.000Z",
  closedAt: null,
  openingAmountMinor: "1000",
  closingAmountMinor: null,
  cashSalesMinor: "0",
  saleChangeMinor: "0",
  cardMinor: "0",
  transferMinor: "0",
  manualInMinor: "0",
  manualOutMinor: "0",
  expectedAmountMinor: "1000",
  differenceMinor: null,
  movements: [],
  cashPayments: [],
} as unknown as CashSession;

describe("cobros pendientes sin conexión (SISTEMA-81)", () => {
  const cobros = [
    { id: "c1", destinationRegisterId: null, cashMinor: "500" },
    { id: "c2", destinationRegisterId: "r1", cashMinor: "300" },
  ];
  const bandeja = [
    op("o1", 1, {
      tipo: "COBRO_DESTINO",
      collectionId: "c1",
      cashRegisterId: "r1",
    }),
    op("o2", 2, {
      tipo: "COBRO_INCORPORAR",
      collectionId: "c2",
      sessionId: "s1",
      amountMinor: 300,
    }),
  ];

  it("la lista muestra la caja asignada y saca los incorporados", () => {
    expect(cobrosConPendientes(cobros, bandeja, "o1", "b1")).toEqual([
      { id: "c1", destinationRegisterId: "r1", cashMinor: "500" },
    ]);
    // Quitar la caja después la deja sin caja.
    const conQuitar = [
      ...bandeja,
      op("o3", 3, {
        tipo: "COBRO_QUITAR",
        collectionId: "c1",
        expectedRegisterId: "r1",
      }),
    ];
    expect(
      cobrosConPendientes(cobros, conQuitar, "o1", "b1")[0]
        ?.destinationRegisterId,
    ).toBeNull();
    // Sin nada pendiente, la misma lista.
    expect(cobrosConPendientes(cobros, [], "o1", "b1")).toBe(cobros);
  });

  it("incorporar suma el efectivo a la sesión; asignar la caja no mueve plata", () => {
    const [s] = aplicarCajaLocal([sesion], bandeja, "o1", "b1");
    expect(s).toMatchObject({
      closedAt: null,
      expectedAmountMinor: "1300",
      manualInMinor: "300",
    });
    expect(s?.movements).toHaveLength(1);
  });
});
