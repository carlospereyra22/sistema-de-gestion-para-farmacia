import { describe, expect, it } from "vitest";
import type {
  CashSession,
  CustomerAccount,
  Purchase,
  ReportSummary,
} from "./api";
import type { VentaPendiente } from "./bandeja-ventas";
import {
  aCobrar,
  cajasConPendientes,
  comprasPorRecibir,
  deudaConProveedores,
  ventasConPendientes,
} from "./inicio-sin-conexion";

const resumen: ReportSummary = {
  salesTodayCount: 2,
  salesTodayMinor: "3000",
  averageTicketMinor: "1500",
  salesTrend: [
    { date: "2026-11-09", totalMinor: "5000", count: 3 },
    { date: "2026-11-10", totalMinor: "3000", count: 2 },
  ],
  stockLots: 0,
  stockUnits: 0,
  expiringLots: 0,
  pendingPurchases: 0,
  openCashSessions: 0,
};

const venta = (
  id: string,
  occurredAt: string,
  extra: Partial<VentaPendiente> = {},
) =>
  ({
    id,
    organizationId: "o1",
    branchId: "b1",
    occurredAt,
    totalMinor: "1000",
    estado: "PENDIENTE",
    ...extra,
  }) as VentaPendiente;

describe("Inicio sin conexión (SISTEMA-86)", () => {
  it("suma a ventas de hoy, ticket promedio y curva las ventas sin enviar de hoy", () => {
    const bandeja = [
      venta("v1", "2026-11-10T15:00:00.000Z"),
      // Ayer (en Argentina), otra sucursal, ya enviada y una operación de caja: no.
      venta("v2", "2026-11-10T02:00:00.000Z"),
      venta("v3", "2026-11-10T15:00:00.000Z", { branchId: "b2" }),
      venta("v4", "2026-11-10T15:00:00.000Z", { estado: "ENVIADA" }),
      venta("v5", "2026-11-10T15:00:00.000Z", { operacion: "CAJA" }),
    ];
    const r = ventasConPendientes(resumen, bandeja, "o1", "b1", "2026-11-10");
    expect(r).toMatchObject({
      salesTodayMinor: "4000",
      salesTodayCount: 3,
      averageTicketMinor: "1333",
    });
    expect(r.salesTrend?.at(-1)).toEqual({
      date: "2026-11-10",
      totalMinor: "4000",
      count: 3,
    });
    expect(r.salesTrend?.[0]?.totalMinor).toBe("5000");
    // Sin nada pendiente, el mismo resumen.
    expect(ventasConPendientes(resumen, [], "o1", "b1", "2026-11-10")).toBe(
      resumen,
    );
  });

  it("a cobrar sólo cuenta clientes con deuda", () => {
    const cuentas = [
      { balanceMinor: "1500" },
      { balanceMinor: "0" },
      { balanceMinor: "-200" },
      { balanceMinor: "500" },
    ] as CustomerAccount[];
    expect(aCobrar(cuentas)).toEqual({ count: 2, totalMinor: "2000" });
  });

  it("deuda con proveedores con el criterio de vencimientos de Cuentas por pagar", () => {
    const deudas = [
      {
        id: "d1",
        dues: [
          { dueOn: "2026-11-01", balanceMinor: "1000" },
          { dueOn: "2026-11-10", balanceMinor: "200" },
          { dueOn: "2026-11-15", balanceMinor: "300" },
          { dueOn: "2026-12-30", balanceMinor: "400" },
        ],
      },
      { id: "d2", dues: [{ dueOn: null, balanceMinor: "50" }] },
      { id: "d3", dues: [{ dueOn: "2026-11-02", balanceMinor: "0" }] },
    ];
    expect(deudaConProveedores(deudas, "2026-11-10")).toEqual({
      count: 2,
      totalMinor: "1950",
      overdueMinor: "1000",
      todayMinor: "200",
      next7Minor: "300",
      nextDueOn: "2026-11-01",
    });
  });

  it("cada caja con lo que ve la PC; compras por recibir", () => {
    const cajas = [
      { id: "r1", name: "Mostrador", open: false, expectedAmountMinor: null },
      { id: "r2", name: "Fondo", open: true, expectedAmountMinor: "100" },
    ];
    const sesiones = [
      { cashRegisterId: "r1", closedAt: null, expectedAmountMinor: "2500" },
    ] as CashSession[];
    expect(cajasConPendientes(cajas, sesiones)).toEqual([
      { id: "r1", name: "Mostrador", open: true, expectedAmountMinor: "2500" },
      { id: "r2", name: "Fondo", open: false, expectedAmountMinor: null },
    ]);
    const compras = [
      { status: "ORDERED" },
      { status: "PARTIALLY_RECEIVED" },
      { status: "RECEIVED" },
    ] as Purchase[];
    expect(comprasPorRecibir(compras)).toBe(2);
  });
});
