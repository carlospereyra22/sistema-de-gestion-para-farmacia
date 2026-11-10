import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invoice } from "../supplier-payables/api";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import {
  guardarVentaPendiente,
  ventasDeLaPc,
  type VentaPendiente,
} from "./bandeja-ventas";
import { activarSesionGuardada } from "./cache-local";
import {
  deudaConPendientes,
  deudasConPendientes,
  guardarOperacionPagar,
  hoyEnArgentina,
  operacionPagarTexto,
  paginaDeDeudas,
  presentarDeuda,
  repartirPago,
} from "./pagar-sin-conexion";

const HOY = "2026-11-10";
const contexto = {
  proveedores: [{ id: "s1", name: "Droguería Sur" }],
  compras: [{ id: "p1", supplierId: "s1", reference: "Pedido 12" }],
};

/** Deuda del servidor con dos vencimientos: uno vencido y otro a 20 días. */
const delServidor = (): Invoice =>
  presentarDeuda(
    {
      id: "f1",
      branchId: "b1",
      supplierId: "s1",
      supplierName: "Droguería Sur",
      purchaseId: null,
      receiptId: null,
      purchaseReference: null,
      purchaseEstimatedMinor: null,
      differenceMinor: null,
      documentType: "FACTURA_C",
      pointOfSale: "0003",
      documentNumber: "00001234",
      issuedOn: "2026-11-01",
      amountMinor: "10000",
      balanceMinor: "10000",
      paidMinor: "0",
      paymentStatus: "PENDING",
      payments: [],
      reference: null,
      notes: null,
      createdAt: "2026-11-01T12:00:00.000Z",
      createdByName: "Ana",
      dues: [
        {
          id: "d1",
          sequence: 1,
          dueOn: "2026-11-05",
          amountMinor: "4000",
          balanceMinor: "4000",
        },
        {
          id: "d2",
          sequence: 2,
          dueOn: "2026-11-30",
          amountMinor: "6000",
          balanceMinor: "6000",
        },
      ],
      overdueMinor: "0",
      todayMinor: "0",
      next7Minor: "0",
      next30Minor: "0",
      nextDueOn: null,
      dueStatus: "UNDATED",
    },
    HOY,
  );

const pago = (operationId: string, importe: string) => ({
  operationId,
  amountMinor: importe,
  expectedBalanceMinor: "10000",
  paidOn: HOY,
  method: "TRANSFER",
});

describe("cuentas por pagar sin conexión", () => {
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

  it("calcula saldo, vencido y estado como el servidor", () => {
    const deuda = delServidor();
    expect(deuda).toMatchObject({
      balanceMinor: "10000",
      overdueMinor: "4000",
      next30Minor: "6000",
      nextDueOn: "2026-11-05",
      dueStatus: "OVERDUE",
      paymentStatus: "PENDING",
    });
  });

  it("reparte el pago del vencimiento más viejo al más nuevo", () => {
    expect(repartirPago(delServidor().dues, 5000n)).toEqual([
      { dueId: "d1", amountMinor: "4000" },
      { dueId: "d2", amountMinor: "1000" },
    ]);
  });

  it("un pago sin conexión baja el saldo enseguida y queda por enviar", async () => {
    await guardarOperacionPagar("o1", "b1", {
      tipo: "PAGO",
      invoiceId: "f1",
      cuerpo: pago("p-1", "5000"),
    });
    const bandeja = await ventasDeLaPc();
    expect(bandeja[0]).toMatchObject({
      id: "p-1",
      operacion: "PAGAR",
      totalMinor: "5000",
    });
    expect(operacionPagarTexto(bandeja[0]!)).toBe("Pago a proveedor");
    const [deuda] = deudasConPendientes(
      [delServidor()],
      bandeja,
      "o1",
      "b1",
      HOY,
      contexto,
    );
    expect(deuda).toMatchObject({
      balanceMinor: "5000",
      paidMinor: "5000",
      overdueMinor: "0",
      dueStatus: "UPCOMING",
      paymentStatus: "PARTIAL",
      porEnviar: true,
    });
    expect(deuda!.payments[0]).toMatchObject({
      id: "p-1",
      createdByName: "Ana",
      porEnviar: true,
    });
    expect(deudaConPendientes(bandeja, "o1", "b1", "f1")).toBe(true);
    expect(deudaConPendientes(bandeja, "o1", "b1", "otra")).toBe(false);
  });

  it("anular sin conexión devuelve el saldo, también un pago todavía no enviado", async () => {
    await guardarOperacionPagar("o1", "b1", {
      tipo: "PAGO",
      invoiceId: "f1",
      cuerpo: pago("p-1", "10000"),
    });
    await guardarOperacionPagar("o1", "b1", {
      tipo: "ANULAR",
      invoiceId: "f1",
      paymentId: "p-1",
      cuerpo: { reason: "Error de carga" },
    });
    const [deuda] = deudasConPendientes(
      [delServidor()],
      await ventasDeLaPc(),
      "o1",
      "b1",
      HOY,
      contexto,
    );
    expect(deuda!.balanceMinor).toBe("10000");
    expect(deuda!.payments[0]).toMatchObject({
      voidReason: "Error de carga",
      voidedByName: "Ana",
    });
  });

  it("una deuda cargada sin conexión se ve con su proveedor y se puede pagar", async () => {
    await guardarOperacionPagar("o1", "b1", {
      tipo: "DEUDA",
      cuerpo: {
        operationId: "f-nueva",
        supplierId: "s1",
        purchaseId: "p1",
        documentType: "OTRO",
        pointOfSale: "",
        documentNumber: "",
        issuedOn: HOY,
        amountMinor: "3000",
        dues: [{ dueOn: null, amountMinor: "3000" }],
      },
    });
    await guardarOperacionPagar("o1", "b1", {
      tipo: "PAGO",
      invoiceId: "f-nueva",
      cuerpo: pago("p-2", "1000"),
    });
    const deudas = deudasConPendientes(
      [],
      await ventasDeLaPc(),
      "o1",
      "b1",
      HOY,
      contexto,
    );
    expect(deudas[0]).toMatchObject({
      id: "f-nueva",
      supplierName: "Droguería Sur",
      purchaseReference: "Pedido 12",
      balanceMinor: "2000",
      dueStatus: "UNDATED",
      porEnviar: true,
    });
  });

  it("la deuda de una recepción sin enviar aparece con la clave de la recepción", async () => {
    const recepcion: VentaPendiente = {
      version: 1,
      id: "r-1",
      alcance: "ana@farmacia.com",
      organizationId: "o1",
      branchId: "b1",
      occurredAt: "2026-11-10T13:00:00.000Z",
      totalMinor: "0",
      documentType: "INTERNAL",
      cuerpo: {
        tipo: "RECEPCION",
        occurredAt: "2026-11-10T13:00:00.000Z",
        purchaseId: "p1",
        cuerpo: {
          operationId: "r-1",
          debt: { amountMinor: "7500", dueOn: "2026-12-10" },
        },
      },
      unidades: [],
      estado: "PENDIENTE",
      intentos: 0,
      operacion: "COMPRA",
    };
    await guardarVentaPendiente(recepcion);
    const bandeja = await ventasDeLaPc();
    const [deuda] = deudasConPendientes([], bandeja, "o1", "b1", HOY, contexto);
    expect(deuda).toMatchObject({
      id: "r-1",
      supplierName: "Droguería Sur",
      amountMinor: "7500",
      nextDueOn: "2026-12-10",
      receiptId: "r-1",
    });
    // Un pago a esa deuda espera detrás de la recepción.
    expect(deudaConPendientes(bandeja, "o1", "b1", "r-1")).toBe(true);
  });

  it("filtra, ordena y pagina como el listado del servidor", () => {
    const vencida = delServidor();
    const saldada = presentarDeuda(
      {
        ...delServidor(),
        id: "f2",
        payments: [
          {
            id: "x",
            amountMinor: "10000",
            paidOn: HOY,
            method: "CASH",
            reference: null,
            createdAt: HOY,
            createdByName: "Ana",
            voidedAt: null,
            voidedByName: null,
            voidReason: null,
            allocations: [
              { dueId: "d1", amountMinor: "4000" },
              { dueId: "d2", amountMinor: "6000" },
            ],
          },
        ],
      },
      HOY,
    );
    const permisos = { today: HOY, canCreate: true, canPay: true };
    const pendientes = paginaDeDeudas(
      [saldada, vencida],
      { payment: "OPEN" },
      permisos,
    );
    expect(pendientes.items.map((d) => d.id)).toEqual(["f1"]);
    expect(pendientes).toMatchObject({
      total: 1,
      totalMinor: "10000",
      overdueMinor: "4000",
    });
    expect(
      paginaDeDeudas([saldada, vencida], { due: "OVERDUE" }, permisos).total,
    ).toBe(1);
    expect(
      paginaDeDeudas([saldada, vencida], { search: "1234" }, permisos).total,
    ).toBe(2);
  });

  it("la fecha de hoy es la de Argentina", () => {
    expect(hoyEnArgentina(new Date("2026-11-11T02:00:00.000Z"))).toBe(
      "2026-11-10",
    );
  });
});
