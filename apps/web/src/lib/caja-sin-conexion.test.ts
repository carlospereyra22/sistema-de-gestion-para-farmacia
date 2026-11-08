import { describe, expect, it } from "vitest";
import type { CashSession } from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import { aplicarCajaLocal, type OperacionCaja } from "./caja-sin-conexion";

const base = {
  version: 1 as const,
  alcance: "ana@farmacia.com",
  organizationId: "o1",
  branchId: "b1",
  totalMinor: "0",
  documentType: "INTERNAL" as const,
  unidades: [],
  estado: "PENDIENTE" as const,
  intentos: 0,
};
const caja = (minuto: number, op: Partial<OperacionCaja>): VentaPendiente => {
  const occurredAt = `2026-11-08T12:${String(minuto).padStart(2, "0")}:00.000Z`;
  const id = op.clientOperationId ?? `op-${minuto}`;
  return {
    ...base,
    id,
    occurredAt,
    operacion: "CAJA",
    cuerpo: { clientOperationId: id, occurredAt, deviceId: "pc", ...op },
  };
};
const venta = (
  minuto: number,
  total: number,
  pagos: unknown[],
): VentaPendiente => ({
  ...base,
  id: `venta-${minuto}`,
  occurredAt: `2026-11-08T12:${String(minuto).padStart(2, "0")}:00.000Z`,
  totalMinor: String(total),
  cuerpo: { items: [], payments: pagos },
});
const abierta = (datos: Partial<CashSession> = {}): CashSession => ({
  id: "s1",
  cashRegisterId: "r1",
  openedAt: "2026-11-08T08:00:00.000Z",
  closedAt: null,
  openingAmountMinor: "10000",
  closingAmountMinor: null,
  cashSalesMinor: "0",
  saleChangeMinor: "0",
  cardMinor: "0",
  transferMinor: "0",
  manualInMinor: "0",
  manualOutMinor: "0",
  expectedAmountMinor: "10000",
  differenceMinor: null,
  movements: [],
  ...datos,
});

describe("caja sin conexión en pantalla", () => {
  it("abre una caja en la PC y le suma ventas y movimientos", () => {
    const [sesion] = aplicarCajaLocal(
      [],
      [
        caja(1, {
          tipo: "APERTURA",
          clientOperationId: "ap",
          cashRegisterId: "r1",
          openingAmountMinor: 5000,
        }),
        venta(2, 3000, [
          { method: "CASH", amountMinor: 5000, cashSessionId: "ap" },
        ]),
        caja(3, {
          tipo: "MOVIMIENTO",
          sessionId: "ap",
          type: "OUT",
          amountMinor: 1000,
          reason: "Flete",
        }),
      ],
      "o1",
      "b1",
    );
    // 50 de fondo + 30 de venta (cobró 50, vuelto 20) - 10 de egreso.
    expect(sesion).toMatchObject({
      id: "ap",
      cashRegisterId: "r1",
      cashSalesMinor: "5000",
      saleChangeMinor: "2000",
      manualOutMinor: "1000",
      expectedAmountMinor: "7000",
    });
    expect(sesion!.movements).toHaveLength(1);
    // La venta aparece en "Últimos movimientos", neta del vuelto.
    expect(sesion!.cashPayments).toEqual([
      expect.objectContaining({ saleId: "venta-2", amountMinor: "3000" }),
    ]);
  });

  it("si la caja ya figuraba abierta, la apertura de la PC se suma a esa", () => {
    const [sesion] = aplicarCajaLocal(
      [abierta()],
      [
        caja(1, {
          tipo: "APERTURA",
          clientOperationId: "ap",
          cashRegisterId: "r1",
          openingAmountMinor: 0,
        }),
        caja(2, {
          tipo: "MOVIMIENTO",
          sessionId: "ap",
          type: "IN",
          amountMinor: 500,
        }),
      ],
      "o1",
      "b1",
    );
    expect(sesion).toMatchObject({ id: "s1", expectedAmountMinor: "10500" });
  });

  it("un cierre en la PC la saca de las abiertas", () => {
    expect(
      aplicarCajaLocal(
        [abierta()],
        [
          caja(1, {
            tipo: "CIERRE",
            sessionId: "s1",
            closingAmountMinor: 10000,
          }),
        ],
        "o1",
        "b1",
      ),
    ).toEqual([]);
  });

  it("no toca otras sucursales ni lo ya enviado", () => {
    const sesiones = [abierta()];
    expect(
      aplicarCajaLocal(
        sesiones,
        [
          { ...caja(1, { tipo: "CIERRE", sessionId: "s1" }), branchId: "b2" },
          {
            ...caja(2, { tipo: "CIERRE", sessionId: "s1" }),
            estado: "ENVIADA",
          },
        ],
        "o1",
        "b1",
      ),
    ).toEqual(sesiones);
  });
});

describe("último cierre hecho en la PC", () => {
  it("se muestra con lo contado y la diferencia, aunque el cierre no traiga la caja", async () => {
    const { ultimoCierreLocal } = await import("./caja-sin-conexion");
    const cierre = ultimoCierreLocal(
      [
        caja(1, {
          tipo: "APERTURA",
          clientOperationId: "ap",
          cashRegisterId: "r1",
          openingAmountMinor: 0,
        }),
        caja(2, {
          tipo: "CIERRE",
          sessionId: "ap",
          closingAmountMinor: 67700,
          expectedAmountMinor: 67700,
        }),
      ],
      "o1",
      "b1",
      "r1",
    );
    expect(cierre).toMatchObject({
      closingAmountMinor: "67700",
      differenceMinor: "0",
      sinEnviar: true,
    });
  });
});
