import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import type { Transfer } from "./api";
import {
  guardarVentaPendiente,
  unidadesPendientes,
  ventasDeLaPc,
  type VentaPendiente,
} from "./bandeja-ventas";
import { activarSesionGuardada } from "./cache-local";
import { aplicarCajaLocal } from "./caja-sin-conexion";
import { historialConPendientes } from "./historial-con-pendientes";
import {
  guardarOperacionTransferencia,
  lotesParaTransferir,
  renglonesDeLotes,
  transferenciaConPendientes,
  transferenciasConPendientes,
  unidadesDeTransferencia,
  type OperacionTransferencia,
} from "./transferencias-sin-conexion";

const lote = (
  id: string,
  productId: string,
  number: string,
  quantity: number,
) => ({
  id,
  productId,
  number,
  quantity,
});

const enTransito: Transfer = {
  id: "t1",
  sourceBranchId: "b2",
  destinationBranchId: "b1",
  status: "IN_TRANSIT",
  createdAt: "2026-11-09T10:00:00.000Z",
  items: [
    { id: "i1", productId: "a", lotId: "l9", quantity: 4, receivedQuantity: 0 },
  ],
};

describe("transferencias sin conexión", () => {
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

  it("una preparada sin conexión se ve en la lista como preparada y por enviar", async () => {
    const op = await guardarOperacionTransferencia("o1", "b1", {
      tipo: "PREPARAR",
      cuerpo: {
        destinationBranchId: "b2",
        items: [{ productId: "a", lotNumber: "L-1", quantity: 3 }],
      },
    });
    const bandeja = await ventasDeLaPc();
    expect(bandeja[0]).toMatchObject({
      operacion: "TRANSFERENCIA",
      actorName: "Ana",
    });
    const [fila] = transferenciasConPendientes([], bandeja, "o1", "b1");
    expect(fila).toMatchObject({
      id: op.clientOperationId,
      status: "PREPARED",
      sourceBranchId: "b1",
      destinationBranchId: "b2",
      porEnviar: true,
    });
    expect(fila!.items[0]).toMatchObject({ lotNumber: "L-1", quantity: 3 });
    // Preparar no mueve stock, ni toca caja ni el historial de ventas.
    expect(unidadesPendientes(bandeja, "o1", "b1").size).toBe(0);
    expect(aplicarCajaLocal([], bandeja, "o1", "b1")).toEqual([]);
    expect(historialConPendientes([], bandeja, "o1", "b1")).toEqual([]);
    // En otra sucursal no aparece.
    expect(transferenciasConPendientes([], bandeja, "o1", "b2")).toEqual([]);
  });

  it("despachar sin conexión descuenta el stock del lote y la marca en tránsito", async () => {
    const op = await guardarOperacionTransferencia("o1", "b1", {
      tipo: "PREPARAR",
      cuerpo: {
        destinationBranchId: "b2",
        items: [{ lotId: "l1", productId: "a", lotNumber: "L-1", quantity: 3 }],
      },
    });
    const lotes = [lote("l1", "a", "L-1", 10)];
    let bandeja = await ventasDeLaPc();
    const [preparada] = transferenciasConPendientes([], bandeja, "o1", "b1");
    expect(transferenciaConPendientes(bandeja, "o1", "b1", preparada!)).toBe(
      true,
    );
    await guardarOperacionTransferencia(
      "o1",
      "b1",
      { tipo: "DESPACHAR", cuerpo: { transferId: op.clientOperationId } },
      unidadesDeTransferencia("DESPACHAR", preparada!, lotes),
    );
    bandeja = await ventasDeLaPc();
    expect(
      transferenciasConPendientes([], bandeja, "o1", "b1")[0]!.status,
    ).toBe("IN_TRANSIT");
    expect(unidadesPendientes(bandeja, "o1", "b1").get("a")).toBe(3);
    expect(
      lotesParaTransferir(lotes, lotes, bandeja, "o1", "b1")[0]!.quantity,
    ).toBe(7);
  });

  it("recibir sin conexión suma el stock y la marca recibida", async () => {
    await guardarOperacionTransferencia(
      "o1",
      "b1",
      { tipo: "RECIBIR", cuerpo: { transferId: "t1" } },
      unidadesDeTransferencia("RECIBIR", enTransito, []),
    );
    const bandeja = await ventasDeLaPc();
    const [fila] = transferenciasConPendientes(
      [enTransito],
      bandeja,
      "o1",
      "b1",
    );
    expect(fila).toMatchObject({ status: "RECEIVED", porEnviar: true });
    // En negativo: suma stock en la pantalla de ventas.
    expect(unidadesPendientes(bandeja, "o1", "b1").get("a")).toBe(-4);
  });

  it("una que ya llegó al servidor no se duplica en la lista", async () => {
    const op = await guardarOperacionTransferencia("o1", "b1", {
      tipo: "PREPARAR",
      cuerpo: {
        destinationBranchId: "b2",
        items: [{ productId: "a", lotNumber: "L-1", quantity: 3 }],
      },
    });
    const bandeja = await ventasDeLaPc();
    const delServidor: Transfer = {
      ...enTransito,
      id: "t5",
      clientOperationId: op.clientOperationId,
      sourceBranchId: "b1",
      destinationBranchId: "b2",
      status: "PREPARED",
    };
    const lista = transferenciasConPendientes(
      [delServidor],
      bandeja,
      "o1",
      "b1",
    );
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: "t5", porEnviar: true });
  });

  it("nunca deja transferir más de lo que queda del producto después de lo vendido sin enviar", async () => {
    const venta = {
      version: 1,
      id: "v1",
      alcance: "ana@farmacia.com",
      organizationId: "o1",
      branchId: "b1",
      occurredAt: "2026-11-09T10:00:00.000Z",
      totalMinor: "100",
      documentType: "INTERNAL",
      cuerpo: {},
      unidades: [{ productId: "a", cantidad: 8 }],
      estado: "PENDIENTE",
      intentos: 0,
    } satisfies VentaPendiente;
    await guardarVentaPendiente(venta);
    const lotes = [lote("l1", "a", "L-1", 6), lote("l2", "a", "L-2", 4)];
    const disponibles = lotesParaTransferir(
      lotes,
      lotes,
      await ventasDeLaPc(),
      "o1",
      "b1",
    );
    expect(disponibles.map((l) => l.quantity)).toEqual([2, 2]);
  });

  it("un lote recibido sin conexión se manda por producto y número", () => {
    expect(
      renglonesDeLotes(
        [
          { lotId: "l1", quantity: 2 },
          { lotId: "sin-enviar:a|L-7", quantity: 1 },
        ],
        [lote("l1", "a", "L-1", 5), lote("sin-enviar:a|L-7", "a", "L-7", 3)],
      ),
    ).toEqual([
      { lotId: "l1", productId: "a", lotNumber: "L-1", quantity: 2 },
      { productId: "a", lotNumber: "L-7", quantity: 1 },
    ]);
  });

  it("guarda la operación firmable, con su hora y su PC", async () => {
    const op = (await guardarOperacionTransferencia("o1", "b1", {
      tipo: "RECIBIR",
      cuerpo: { transferId: "t1" },
    })) satisfies OperacionTransferencia;
    const [guardada] = await ventasDeLaPc();
    expect(guardada!.cuerpo).toEqual(op);
    expect(op.deviceId).toBeTruthy();
    expect(Date.parse(op.occurredAt)).not.toBeNaN();
  });
});
