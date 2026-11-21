import { describe, expect, it } from "vitest";
import type { NotaCredito, NotasCreditoVenta } from "./api";
import {
  comprobanteNota,
  estadoNota,
  importeRenglon,
  mercaderiaNota,
  opcionesClientes,
  resumenDevolucion,
  renglonesPedido,
  ticketNotaInterna,
  todaLaVenta,
  totalSeleccion,
} from "./nota-credito";
import { thermalTicketHtml } from "./thermal-ticket";

const renglon = (
  cambios: Partial<NotasCreditoVenta["items"][number]> = {},
): NotasCreditoVenta["items"][number] => ({
  id: "r1",
  name: "Ibuprofeno",
  productId: "p1",
  quantity: 3,
  available: 3,
  unitPriceMinor: "1000",
  discountMinor: "1",
  puedeReponer: true,
  ...cambios,
});

describe("vista previa de la nota de crédito", () => {
  it("prorratea el descuento como el servidor", () => {
    expect(importeRenglon(renglon(), 1)).toBe(999n);
    expect(importeRenglon(renglon({ available: 2 }), 2)).toBe(2000n);
    expect(importeRenglon(renglon(), 3)).toBe(2999n);
    expect(importeRenglon(renglon(), 0)).toBe(0n);
  });

  it("toda la venta toma lo que queda y repone sólo lo que se puede", () => {
    const items = [
      renglon(),
      renglon({ id: "r2", available: 0 }),
      renglon({ id: "r3", productId: null, puedeReponer: false }),
    ];
    const seleccion = todaLaVenta(items);
    expect(seleccion).toEqual({ r1: 3, r3: 3 });
    expect(totalSeleccion(items, seleccion)).toBe(5998n);
    expect(renglonesPedido(items, seleccion, true)).toEqual([
      { saleItemId: "r1", quantity: 3, reponer: true },
      { saleItemId: "r3", quantity: 3, reponer: false },
    ]);
    expect(renglonesPedido(items, seleccion, false)[0]?.reponer).toBe(false);
  });

  it("no pide más de lo disponible ni renglones en cero", () => {
    expect(
      renglonesPedido([renglon({ available: 1 })], { r1: 5 }, false),
    ).toEqual([{ saleItemId: "r1", quantity: 1, reponer: false }]);
    expect(renglonesPedido([renglon()], { r1: 0 }, true)).toEqual([]);
  });

  it("arma el ticket de la nota interna con la devolución", () => {
    const nota: NotaCredito = {
      id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      saleId: "venta",
      creditKind: "INTERNA",
      createdAt: "2026-11-21T15:00:00.000Z",
      reason: "Vencido",
      totalMinor: "9500",
      accountMinor: "0",
      refundMinor: "9500",
      refundMethod: "CASH",
      items: [
        {
          saleItemId: "r1",
          name: "Ibuprofeno",
          quantity: 1,
          amountMinor: "9500",
          restocked: true,
        },
      ],
      fiscal: null,
    };
    const ticket = ticketNotaInterna(nota, {
      kind: "sale",
      id: "venta",
      number: "AB12CD34",
      date: "2026-11-20T10:00:00.000Z",
      store: { name: "Farmacia" },
      branch: "Casa Central",
      customer: "Público general",
      items: [],
      totalMinor: "19000",
      payments: [],
    });
    expect(ticket).toMatchObject({
      kind: "credit",
      number: "0F8FAD5B",
      totalMinor: "9500",
      payments: [{ method: "CASH", amountMinor: "9500" }],
    });
    expect(ticket.note).toContain("#AB12CD34");
    const html = thermalTicketHtml(ticket, "");
    expect(html).toContain("NOTA DE CRÉDITO INTERNA");
    expect(html).toContain("NO VÁLIDO COMO FACTURA");
    expect(html).toContain("TOTAL ACREDITADO");
    expect(html).toContain("DEVOLUCIÓN");
    expect(html).not.toContain("GRACIAS POR TU COMPRA");
  });
});

describe("textos del listado de notas", () => {
  const base: NotaCredito = {
    id: "ce27d243-0000-4000-8000-000000000000",
    saleId: "venta",
    creditKind: "INTERNA",
    createdAt: "2026-11-21T15:00:00.000Z",
    reason: "x",
    totalMinor: "3000",
    accountMinor: "1000",
    refundMinor: "2000",
    refundMethod: "TRANSFER",
    items: [
      {
        saleItemId: "a",
        name: "A",
        quantity: 2,
        amountMinor: "2000",
        restocked: true,
      },
      {
        saleItemId: "b",
        name: "B",
        quantity: 1,
        amountMinor: "1000",
        restocked: false,
      },
    ],
    fiscal: null,
  };
  it("interna: código propio, estado neutro y devolución combinada", () => {
    expect(comprobanteNota(base)).toEqual({
      texto: "Nota interna",
      codigo: "CE27D243",
      prueba: false,
    });
    expect(estadoNota(base)).toEqual({ texto: "Interna", tono: "neutro" });
    expect(resumenDevolucion(base)).toBe("Transferencia + Cuenta corriente");
    expect(mercaderiaNota(base)).toEqual({
      unidades: 3,
      texto: "2 volvieron al stock",
    });
  });
  it("C de prueba con número de ARCA", () => {
    const nota = {
      ...base,
      fiscal: {
        environment: "HOMOLOGATION",
        status: "AUTHORIZED",
        point: 1,
        number: 12,
      },
    } as unknown as NotaCredito;
    expect(comprobanteNota(nota)).toMatchObject({
      texto: "NC C 00001-00000012",
      prueba: true,
    });
    expect(estadoNota(nota).texto).toBe("Autorizada");
  });
});

describe("filtro de cliente de los historiales", () => {
  it("Todos, Público general y los clientes por nombre", () => {
    expect(
      opcionesClientes([
        { id: "b", name: "Zulma" },
        { id: "a", name: "Ana" },
      ]),
    ).toEqual([
      { value: "", label: "Todos" },
      { value: "SIN_CLIENTE", label: "Público general" },
      { value: "a", label: "Ana" },
      { value: "b", label: "Zulma" },
    ]);
  });
});
