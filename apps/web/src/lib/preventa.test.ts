import { describe, expect, it } from "vitest";

import type { PedidoPreventa } from "./preventa-api";
import {
  cambiarDia,
  diaLocal,
  diasDeVisita,
  distanciaKm,
  linkMapa,
  linkRecorrido,
  numeroDePedido,
  pesosACentavos,
  porcentajeABps,
  recorrido,
  saldoDelPedido,
  telefonoWhatsapp,
  textoDelPedido,
} from "./preventa";

describe("preventa: formatos", () => {
  it("numera los pedidos con cinco cifras", () => {
    expect(numeroDePedido(42)).toBe("P-00042");
  });

  it("lee importes en pesos con o sin separadores", () => {
    expect(pesosACentavos("1.500,50")).toBe(150_050);
    expect(pesosACentavos("1500")).toBe(150_000);
    expect(pesosACentavos("$ 2.000")).toBe(200_000);
    expect(pesosACentavos("")).toBe(0);
    expect(pesosACentavos("abc")).toBeNull();
  });

  it("lee porcentajes con coma", () => {
    expect(porcentajeABps("2,5")).toBe(250);
    expect(porcentajeABps("150")).toBeNull();
  });

  it("arma la fecha local sin pasar por UTC", () => {
    expect(diaLocal(0, new Date(2026, 10, 17, 23, 30))).toBe("2026-11-17");
    expect(diaLocal(1, new Date(2026, 10, 1, 8))).toBe("2026-10-31");
  });

  it("muestra los días de visita", () => {
    const lunesYJueves = cambiarDia(cambiarDia(0, 1), 4);
    expect(diasDeVisita(lunesYJueves)).toBe("Lu · Ju");
    expect(diasDeVisita(0)).toBe("Sin días fijos");
    expect(diasDeVisita(127)).toBe("Todos los días");
  });

  it("prepara el teléfono para WhatsApp", () => {
    expect(telefonoWhatsapp("0351 15-555-1234")).toBe("5435115555123" + "4");
    expect(telefonoWhatsapp("+54 9 11 5555 1234")).toBe("5491155551234");
    expect(telefonoWhatsapp("123")).toBeNull();
  });
});

describe("preventa: recorrido", () => {
  const plaza = { latitude: -31.4167, longitude: -64.1833 };
  const cerca = { id: "cerca", latitude: -31.42, longitude: -64.19 };
  const lejos = { id: "lejos", latitude: -31.5, longitude: -64.3 };
  const medio = { id: "medio", latitude: -31.45, longitude: -64.22 };
  const sinMapa = { id: "sin", latitude: null, longitude: null };

  it("va siempre al más cercano y deja al final los que no tienen ubicación", () => {
    const { orden, km } = recorrido([lejos, sinMapa, cerca, medio], plaza);
    expect(orden.map((p) => p.id)).toEqual(["cerca", "medio", "lejos", "sin"]);
    expect(km).toBeGreaterThan(0);
  });

  it("calcula distancias razonables", () => {
    expect(distanciaKm(plaza, plaza)).toBe(0);
    expect(distanciaKm(plaza, lejos)).toBeGreaterThan(10);
    expect(distanciaKm(plaza, lejos)).toBeLessThan(20);
  });

  it("arma links de Google Maps", () => {
    expect(linkMapa({ latitude: 1, longitude: 2 })).toContain("query=1,2");
    expect(
      linkMapa({ latitude: null, longitude: null, address: "San Martín 10" }),
    ).toContain("San%20Mart%C3%ADn%2010");
    expect(linkMapa({ latitude: null, longitude: null })).toBeNull();
    const ruta = linkRecorrido([cerca, medio], plaza)!;
    expect(ruta).toContain("destination=-31.45%2C-64.22");
    expect(ruta).toContain("waypoints=-31.42%2C-64.19");
  });
});

describe("preventa: comprobante", () => {
  const pedido = {
    number: 7,
    createdAt: "2026-11-17T12:00:00Z",
    customerName: "Kiosco Pepe",
    totalMinor: "250000",
    paidMinor: "100000",
    offers: [{ label: "2x1", name: "Gaseosas", discountMinor: "50000" }],
    items: [
      {
        productId: "a",
        productName: "Gaseosa",
        quantity: 2,
        listUnitPriceMinor: "100000",
        unitPriceMinor: "100000",
        discountMinor: "0",
        totalMinor: "200000",
      },
    ],
  } as unknown as PedidoPreventa;

  it("arma el texto para WhatsApp con total, pago y saldo", () => {
    const texto = textoDelPedido(pedido, {
      farmacia: "Farmacia Sol",
      sucursal: "",
      direccion: "",
      telefono: "",
      nota: "Gracias por su compra",
    });
    expect(texto).toContain("*Farmacia Sol*");
    expect(texto).toContain("Pedido P-00007");
    expect(texto).toContain("2 x Gaseosa");
    expect(texto).toContain("Oferta 2x1");
    expect(texto).toContain("Saldo:");
    expect(texto.endsWith("Gracias por su compra")).toBe(true);
    expect(saldoDelPedido(pedido)).toBe(150_000n);
  });
});

describe("preventa: secciones", () => {
  it("cada rol ve lo suyo", async () => {
    const { seccionesVisibles, seccionInicial } = await import("./preventa");
    const repartidor = { vender: false, repartir: true, administrar: false };
    expect(seccionesVisibles(repartidor)).toEqual([
      "pedidos",
      "reparto",
      "clientes",
    ]);
    expect(seccionInicial(repartidor)).toBe("reparto");
    const preventista = { vender: true, repartir: false, administrar: false };
    expect(seccionesVisibles(preventista)).not.toContain("configuracion");
    expect(seccionesVisibles(preventista)).not.toContain("reparto");
    expect(seccionInicial(preventista)).toBe("nuevo");
    expect(
      seccionesVisibles({ vender: false, repartir: false, administrar: true }),
    ).toContain("configuracion");
  });
});
