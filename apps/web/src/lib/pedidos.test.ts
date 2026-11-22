import { describe, expect, it } from "vitest";

import type { PedidoDeLaFarmacia } from "./catalogo-online-api";
import {
  buscarPedidos,
  claveDe,
  cobroPendiente,
  detalleDe,
  estadoDe,
  numeroDe,
  paraReparto,
} from "./pedidos";
import type { PedidoUnificado } from "./pedidos-api";
import type { PedidoPreventa } from "./preventa-api";

const delCatalogo = (
  extra: Partial<PedidoDeLaFarmacia> = {},
): PedidoUnificado => ({
  origen: "catalogo",
  pedido: {
    id: "c1",
    number: 12,
    status: "RECEIVED",
    delivery: "PICKUP",
    deliveryAddress: null,
    notes: null,
    decisionNote: null,
    totalMinor: "150000",
    ahorroMinor: "0",
    createdAt: "2026-11-22T12:00:00.000Z",
    decidedAt: null,
    deliveredAt: null,
    stockDeducted: false,
    items: [],
    customerId: "x",
    customerName: "Almacén Ñandú",
    branchName: "Central",
    ...extra,
  },
});

const dePreventa = (extra: Partial<PedidoPreventa> = {}): PedidoUnificado => ({
  origen: "preventa",
  pedido: {
    id: "p1",
    number: 7,
    status: "PENDING",
    customerId: "y",
    customerName: "Kiosco Pepe",
    customerPhone: null,
    customerCreditEnabled: false,
    deliveryAddress: null,
    reference: null,
    latitude: null,
    longitude: null,
    sellerId: "s",
    sellerName: "Laura",
    delivererId: null,
    delivererName: null,
    notes: null,
    deliveryNote: null,
    totalMinor: "90000",
    paidMinor: "0",
    paymentStatus: "SIN_PAGO",
    deliveryEffect: null,
    saleId: null,
    stockDeducted: false,
    cancelReason: null,
    commissionRateBps: null,
    commissionPaid: false,
    createdAt: "2026-11-22T10:00:00.000Z",
    assignedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    updatedAt: "2026-11-22T10:00:00.000Z",
    items: [],
    offers: [],
    payments: [],
    ...extra,
  },
});

describe("pantalla Pedidos (SISTEMA-119)", () => {
  it("muestra el estado con las palabras de cada módulo", () => {
    expect(estadoDe(delCatalogo())).toEqual({
      label: "Por confirmar",
      tono: "warning",
    });
    expect(estadoDe(dePreventa({ status: "IN_DELIVERY" }))).toEqual({
      label: "En reparto",
      tono: "info",
    });
    expect(estadoDe(delCatalogo({ status: "REJECTED" })).tono).toBe("danger");
  });

  it("numera cada pedido como en su módulo", () => {
    expect(numeroDe(delCatalogo())).toBe("000012");
    expect(numeroDe(dePreventa())).toBe("P-00007");
  });

  it("dice cómo llega o quién lo tomó", () => {
    expect(detalleDe(delCatalogo())).toBe("Retira en Central");
    expect(detalleDe(delCatalogo({ delivery: "DELIVERY" }))).toBe(
      "Envío a domicilio",
    );
    expect(
      detalleDe(dePreventa({ status: "IN_DELIVERY", delivererName: "Martín" })),
    ).toBe("Preventista: Laura · Reparte: Martín");
    expect(detalleDe(dePreventa({ sellerName: null }))).toBe(
      "Pedido de preventa",
    );
  });

  it("avisa el cobro que falta sólo en preventa entregada", () => {
    expect(cobroPendiente(dePreventa())).toBeNull();
    expect(
      cobroPendiente(
        dePreventa({ status: "DELIVERED", paymentStatus: "PARCIAL" }),
      )?.label,
    ).toBe("Pago parcial");
    expect(
      cobroPendiente(
        dePreventa({ status: "DELIVERED", paymentStatus: "PAGADO" }),
      ),
    ).toBeNull();
    expect(cobroPendiente(delCatalogo({ status: "DELIVERED" }))).toBeNull();
  });

  it("busca por cliente o número sin importar tildes", () => {
    const items = [delCatalogo(), dePreventa()];
    expect(buscarPedidos(items, "nandu").map(claveDe)).toEqual(["catalogo:c1"]);
    expect(buscarPedidos(items, "p-0000").map(claveDe)).toEqual([
      "preventa:p1",
    ]);
    expect(buscarPedidos(items, "  ")).toHaveLength(2);
  });

  it("sólo los pendientes de preventa pasan a reparto", () => {
    expect(paraReparto(dePreventa())).toBe(true);
    expect(paraReparto(dePreventa({ status: "IN_DELIVERY" }))).toBe(false);
    expect(paraReparto(delCatalogo())).toBe(false);
  });
});
