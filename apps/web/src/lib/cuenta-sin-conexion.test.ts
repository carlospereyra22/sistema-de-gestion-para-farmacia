import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import { ventasDeLaPc, type VentaPendiente } from "./bandeja-ventas";
import { activarSesionGuardada } from "./cache-local";
import type { AccountItems, CustomerAccount } from "./api";
import {
  aImputaciones,
  aumentoPorPrecio,
  clienteConPendientes,
  clientesConPendientes,
  cuentasConPendientes,
  detalleDeVentaLocal,
  guardarAltaCliente,
  guardarEdicionCliente,
  guardarOperacionCuenta,
  idDeLinea,
  itemsConPendientes,
  lineaDeId,
  repartirAumento,
  vencimientosConPendientes,
  type OperacionCuenta,
} from "./cuenta-sin-conexion";
import { aplicarCajaLocal } from "./caja-sin-conexion";

const base = (extra: Partial<VentaPendiente>): VentaPendiente => ({
  version: 1,
  id: crypto.randomUUID(),
  alcance: "ana@farmacia.com",
  organizationId: "o1",
  branchId: "b1",
  occurredAt: "2026-11-09T12:00:00.000Z",
  totalMinor: "0",
  documentType: "INTERNAL",
  cuerpo: {},
  unidades: [],
  estado: "PENDIENTE",
  intentos: 0,
  ...extra,
});

/** Venta sin conexión a cuenta corriente (como la guarda la venta). */
const ventaACuentaPendiente = (
  id: string,
  lineas: {
    productId: string;
    productName: string;
    precio: number;
    cantidad: number;
  }[],
  aCuenta?: number,
) => {
  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  return base({
    id,
    totalMinor: String(total),
    occurredAt: "2026-11-09T10:00:00.000Z",
    cuerpo: {
      customerId: "c1",
      items: lineas.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        quantity: l.cantidad,
        expectedUnitPriceMinor: l.precio,
      })),
      payments: [
        { method: "ACCOUNT", amountMinor: aCuenta ?? total },
        ...(aCuenta !== undefined && aCuenta < total
          ? [{ method: "CASH", amountMinor: total - aCuenta }]
          : []),
      ],
    },
  });
};

const operacion = (
  tipo: OperacionCuenta["tipo"],
  cuerpo: Record<string, unknown>,
  extra: Partial<VentaPendiente> = {},
) => {
  const id = crypto.randomUUID();
  return base({
    id,
    operacion: "CUENTA",
    occurredAt: "2026-11-09T11:00:00.000Z",
    cuerpo: {
      tipo,
      clientOperationId: id,
      occurredAt: "2026-11-09T11:00:00.000Z",
      deviceId: "pc",
      customerId: "c1",
      cuerpo,
    } satisfies OperacionCuenta,
    ...extra,
  });
};

const cuenta = (extra: Partial<CustomerAccount> = {}): CustomerAccount => ({
  id: "c1",
  name: "Juana",
  creditEnabled: true,
  active: true,
  creditLimitMinor: "100000",
  balanceMinor: "1000",
  movements: [],
  ...extra,
});

const items = (): AccountItems => ({
  balanceMinor: "1000",
  items: [
    {
      saleItemId: "i1",
      saleId: "s1",
      productId: "p1",
      comparable: true,
      name: "Ibuprofeno",
      quantity: 1,
      financedMinor: "1000",
      paidMinor: "0",
      pendingMinor: "1000",
      createdAt: null,
      previousPriceMinor: "1000",
      referencePriceMinor: "1200",
      referenceCheckedAt: null,
      increaseMinor: "200",
    },
  ],
  unassignedReceipts: [],
  mixedSales: [],
});

describe("cuenta corriente sin conexión", () => {
  beforeEach(async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    usarAlmacen(almacenEnMemoria());
    await activarSesionGuardada({
      alcance: "ana@farmacia.com",
      perfil: {
        id: "u1",
        email: "ana@farmacia.com",
        organizations: [{ organizationId: "o1", displayName: "Ana" }],
      },
      ultimaSincronizacion: Date.now(),
    } as Parameters<typeof activarSesionGuardada>[0]);
  });

  it("nombra los renglones de una venta sin conexión y los vuelve a leer", () => {
    const id = idDeLinea({ saleId: "s9", productId: "p1" });
    expect(lineaDeId(id)).toEqual({ saleId: "s9", productId: "p1" });
    expect(
      lineaDeId(idDeLinea({ saleId: "s9", description: "Inyección | x" })),
    ).toEqual({
      saleId: "s9",
      description: "Inyección | x",
    });
    expect(lineaDeId("i1")).toBeUndefined();
    expect(
      aImputaciones([
        { saleItemId: id, amountMinor: 100 },
        { saleItemId: "i1", amountMinor: 50 },
      ]),
    ).toEqual([
      { linea: { saleId: "s9", productId: "p1" }, amountMinor: 100 },
      { saleItemId: "i1", amountMinor: 50 },
    ]);
  });

  it("una venta a cuenta hecha sin conexión suma deuda y artículos que se pueden cobrar", () => {
    const venta = ventaACuentaPendiente("s9", [
      { productId: "p2", productName: "Amoxicilina", precio: 500, cantidad: 2 },
    ]);
    const cuentas = cuentasConPendientes([cuenta()], [venta], "o1");
    expect(cuentas[0]!.balanceMinor).toBe("2000");
    expect(cuentas[0]!.movements.at(-1)).toMatchObject({
      type: "DEBIT",
      saleId: "s9",
      porEnviar: true,
    });
    const detalle = itemsConPendientes(items(), [venta], "o1", "c1");
    expect(detalle.balanceMinor).toBe("2000");
    expect(detalle.items.at(-1)).toMatchObject({
      saleItemId: idDeLinea({ saleId: "s9", productId: "p2" }),
      pendingMinor: "1000",
      porEnviar: true,
    });
    // Si ya llegó al servidor, no se cuenta dos veces.
    expect(
      cuentasConPendientes(
        [
          cuenta({
            balanceMinor: "2000",
            movements: [
              {
                id: "m",
                type: "DEBIT",
                amountMinor: "1000",
                saleId: "s9",
                note: null,
                createdAt: "",
              },
            ],
          }),
        ],
        [venta],
        "o1",
      )[0]!.balanceMinor,
    ).toBe("2000");
  });

  it("una venta mixta sin conexión queda para asignar sus artículos", () => {
    const venta = ventaACuentaPendiente(
      "s9",
      [
        {
          productId: "p2",
          productName: "Amoxicilina",
          precio: 1000,
          cantidad: 1,
        },
      ],
      600,
    );
    const detalle = itemsConPendientes(undefined, [venta], "o1", "c1");
    expect(detalle.mixedSales).toHaveLength(1);
    expect(detalle.mixedSales[0]!.movementId).toBe("s9");
    const asignada = itemsConPendientes(
      undefined,
      [
        venta,
        operacion("ASIGNACION", {
          movementId: "s9",
          imputaciones: [
            { linea: { saleId: "s9", productId: "p2" }, amountMinor: 600 },
          ],
        }),
      ],
      "o1",
      "c1",
    );
    expect(asignada.mixedSales).toEqual([]);
    expect(asignada.items[0]!.pendingMinor).toBe("600");
  });

  it("el cobro sin conexión imputa, ajusta y baja el saldo como con conexión", () => {
    const cobro = operacion("COBRO", {
      amountMinor: 900,
      method: "CASH",
      imputaciones: [
        {
          saleItemId: "i1",
          amountMinor: 900,
          expectedPendingMinor: 1000,
          nextPendingMinor: 900,
        },
      ],
    });
    const detalle = itemsConPendientes(items(), [cobro], "o1", "c1");
    expect(detalle.items[0]).toMatchObject({
      pendingMinor: "0",
      paidMinor: "900",
      financedMinor: "900",
    });
    expect(detalle.balanceMinor).toBe("0");
    const cuentas = cuentasConPendientes([cuenta()], [cobro], "o1");
    expect(cuentas[0]!.balanceMinor).toBe("0");
    expect(cuentas[0]!.movements.map((m) => m.type)).toEqual([
      "CREDIT",
      "CREDIT",
    ]);
  });

  it("un cobro sin artículos queda como cobro sin asignar y se puede asignar sin conexión", () => {
    const cobro = operacion("COBRO", { amountMinor: 300, method: "TRANSFER" });
    const detalle = itemsConPendientes(items(), [cobro], "o1", "c1");
    expect(detalle.unassignedReceipts.map((u) => u.id)).toEqual([cobro.id]);
    const asignado = itemsConPendientes(
      items(),
      [
        cobro,
        operacion(
          "ASIGNACION",
          {
            movementId: cobro.id,
            imputaciones: [{ saleItemId: "i1", amountMinor: 300 }],
          },
          { occurredAt: "2026-11-09T11:30:00.000Z" },
        ),
      ],
      "o1",
      "c1",
    );
    expect(asignado.unassignedReceipts).toEqual([]);
    expect(asignado.items[0]!.pendingMinor).toBe("700");
  });

  it("aumentos de deuda y de precios sólo sobre lo que se debe", () => {
    expect(aumentoPorPrecio(500n, 1000n, 1200n)).toBe(100n);
    expect(aumentoPorPrecio(0n, 1000n, 1200n)).toBe(0n);
    expect(
      repartirAumento(
        [
          { saleItemId: "a", pendingMinor: "100" },
          { saleItemId: "b", pendingMinor: "300" },
        ],
        40n,
      ),
    ).toEqual([
      { saleItemId: "a", amountMinor: 10n },
      { saleItemId: "b", amountMinor: 30n },
    ]);
    const conCobro = itemsConPendientes(
      items(),
      [
        operacion("COBRO", {
          amountMinor: 500,
          method: "CASH",
          imputaciones: [{ saleItemId: "i1", amountMinor: 500 }],
        }),
      ],
      "o1",
      "c1",
    );
    // El aumento sugerido se recalcula con lo que queda.
    expect(conCobro.items[0]!.increaseMinor).toBe("100");
    const actualizado = itemsConPendientes(
      items(),
      [
        operacion("ACTUALIZAR_PRECIOS", {
          saleId: "all",
          referencias: [{ productId: "p1", referencePriceMinor: 1200 }],
        }),
      ],
      "o1",
      "c1",
    );
    expect(actualizado.items[0]).toMatchObject({
      pendingMinor: "1200",
      previousPriceMinor: "1200",
      increaseMinor: "0",
    });
    const aumentado = itemsConPendientes(
      items(),
      [
        operacion("AUMENTO_DEUDA_TOTAL", {
          expectedPendingMinor: 1000,
          nextPendingMinor: 1300,
          reason: "Actualización",
        }),
      ],
      "o1",
      "c1",
    );
    expect(aumentado.balanceMinor).toBe("1300");
    expect(aumentado.items[0]!.pendingMinor).toBe("1300");
  });

  it("configuración y alta de cliente sin conexión se ven enseguida", async () => {
    const alta = await guardarAltaCliente("o1", "b1", { name: "Pedro" });
    await guardarOperacionCuenta("o1", "b1", {
      tipo: "CONFIGURAR",
      customerId: alta.clientOperationId,
      cuerpo: { enabled: true, creditLimitMinor: 50000, accountTermDays: 30 },
    });
    const bandeja = await ventasDeLaPc();
    expect(bandeja.map((v) => v.operacion)).toEqual(["CLIENTE", "CUENTA"]);
    // Lo que se haga con ese cliente espera en la PC, para llegar en orden.
    expect(clienteConPendientes(bandeja, "o1", alta.clientOperationId)).toBe(
      true,
    );
    expect(clienteConPendientes(bandeja, "o1", "c1")).toBe(false);
    const cuentas = cuentasConPendientes([cuenta()], bandeja, "o1");
    expect(cuentas.find((c) => c.id === alta.clientOperationId)).toMatchObject({
      name: "Pedro",
      creditEnabled: true,
      creditLimitMinor: "50000",
      accountTermDays: 30,
      porEnviar: true,
    });
    expect(clientesConPendientes([], bandeja, "o1").map((c) => c.name)).toEqual(
      ["Pedro"],
    );
    // Firmada por quien la hizo, para que la mande otro usuario de la PC.
    expect(bandeja[0]!.vendedorId).toBe("u1");
  });

  it("editar un cliente sin conexión cambia su lista de precios enseguida", async () => {
    await guardarEdicionCliente("o1", "b1", "c1", {
      priceListId: "lista-os",
      billingPhone: " 3764000000 ",
    });
    const bandeja = await ventasDeLaPc();
    expect(bandeja[0]!.operacion).toBe("CLIENTE");
    expect(clienteConPendientes(bandeja, "o1", "c1")).toBe(true);
    const [cliente] = clientesConPendientes(
      [{ id: "c1", name: "Juana", priceListId: null, active: true }],
      bandeja,
      "o1",
    );
    expect(cliente).toMatchObject({
      priceListId: "lista-os",
      billingPhone: "3764000000",
      porEnviar: true,
    });
    expect(
      cuentasConPendientes([cuenta()], bandeja, "o1")[0]!.billingPhone,
    ).toBe("3764000000");
  });

  it("vencimientos: suma la venta sin conexión y baja lo cobrado", () => {
    const venta = ventaACuentaPendiente("s9", [
      {
        productId: "p2",
        productName: "Amoxicilina",
        precio: 1000,
        cantidad: 1,
      },
    ]);
    const cobro = operacion(
      "COBRO",
      { amountMinor: 400, method: "CASH" },
      { local: { ventas: [{ saleId: "s1", deltaMinor: "-400" }] } },
    );
    const r = vencimientosConPendientes(
      {
        today: "2026-11-09",
        rows: [
          {
            saleId: "s1",
            customerId: "c1",
            customerName: "Juana",
            saleDate: null,
            dueDate: null,
            pendingMinor: "1000",
            daysOverdue: 0,
            status: "UNDATED",
            reviewReason: null,
          },
        ],
      },
      [venta, cobro],
      "o1",
      "b1",
      [cuenta({ accountTermDays: 0 })],
    );
    expect(r.rows.find((f) => f.saleId === "s1")!.pendingMinor).toBe("600");
    expect(r.rows.find((f) => f.saleId === "s9")).toMatchObject({
      pendingMinor: "1000",
      status: "TODAY",
    });
  });

  it("detalle de la venta y caja: lo hecho sin conexión se ve como si ya hubiera llegado", () => {
    const venta = ventaACuentaPendiente("s9", [
      { productId: "p2", productName: "Amoxicilina", precio: 500, cantidad: 2 },
    ]);
    expect(detalleDeVentaLocal([venta], "venta|s9")).toMatchObject({
      totalMinor: "1000",
      items: [{ name: "Amoxicilina", subtotalMinor: "1000" }],
    });
    const sesiones = aplicarCajaLocal(
      [
        {
          id: "caja1",
          cashRegisterId: "r1",
          openedAt: "",
          closedAt: null,
          openedByCurrentUser: true,
          openingAmountMinor: "0",
          closingAmountMinor: null,
          cashSalesMinor: "0",
          saleChangeMinor: "0",
          cardMinor: "0",
          transferMinor: "0",
          manualInMinor: "0",
          manualOutMinor: "0",
          expectedAmountMinor: "0",
          differenceMinor: null,
          movements: [],
          cashPayments: [],
        },
      ],
      [
        operacion("COBRO", {
          amountMinor: 700,
          method: "OTHER",
          cashSessionId: "caja1",
          payments: [
            { method: "CASH", amountMinor: 300 },
            { method: "CARD", amountMinor: 400 },
          ],
        }),
      ],
      "o1",
      "b1",
    );
    expect(sesiones[0]!.expectedAmountMinor).toBe("300");
    expect(sesiones[0]!.manualInMinor).toBe("300");
  });
});
