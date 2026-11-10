import { beforeEach, describe, expect, it } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import { VIGENCIA_SIN_CONEXION_MS } from "./cache-local";
import {
  LEYENDA_PROVISORIO,
  ahoraSegunServidor,
  encabezadoGuardado,
  motivoParaNoVenderSinConexion,
  recordarEncabezado,
  registrarHoraServidor,
  ticketProvisorio,
} from "./venta-sin-conexion";

const ahora = Date.parse("2026-11-08T15:00:00.000Z");

describe("cuándo se puede cobrar sin conexión", () => {
  const datos = {
    ultimaSincronizacion: ahora - 60_000,
    ahora,
    acceso: "FULL" as const,
    metodos: ["CASH"],
  };

  it("se puede con datos recientes y la farmacia al día", () => {
    expect(motivoParaNoVenderSinConexion(datos)).toBeNull();
  });

  it("no se puede si pasaron más de 24 horas o nunca sincronizó", () => {
    expect(
      motivoParaNoVenderSinConexion({
        ...datos,
        ultimaSincronizacion: ahora - VIGENCIA_SIN_CONEXION_MS - 1,
      }),
    ).toContain("24 horas");
    expect(
      motivoParaNoVenderSinConexion({
        ...datos,
        ultimaSincronizacion: undefined,
      }),
    ).toContain("24 horas");
  });

  it("no se puede con la farmacia en solo lectura o bloqueada", () => {
    for (const acceso of ["READ_ONLY", "BLOCKED"] as const)
      expect(motivoParaNoVenderSinConexion({ ...datos, acceso })).toContain(
        "solo lectura",
      );
  });

  it("también se puede vender a cuenta corriente sin conexión (SISTEMA-70)", () => {
    expect(
      motivoParaNoVenderSinConexion({ ...datos, metodos: ["CASH", "ACCOUNT"] }),
    ).toBeNull();
  });
});

describe("hora del servidor", () => {
  it("corrige la hora de la PC con el encabezado Date", () => {
    // La PC atrasa 10 minutos.
    registrarHoraServidor(
      "Sun, 08 Nov 2026 15:10:00 GMT",
      Date.parse("2026-11-08T15:00:00.000Z"),
    );
    expect(
      ahoraSegunServidor(Date.parse("2026-11-08T15:30:00.000Z")).toISOString(),
    ).toBe("2026-11-08T15:40:00.000Z");
  });

  it("un encabezado vacío o inválido no cambia la corrección", () => {
    registrarHoraServidor("Sun, 08 Nov 2026 15:00:00 GMT", ahora);
    registrarHoraServidor(null, ahora);
    registrarHoraServidor("cualquier cosa", ahora);
    expect(ahoraSegunServidor(ahora).getTime()).toBe(ahora);
  });
});

describe("ticket provisorio", () => {
  const base = {
    id: "94be5430-0000-4000-8000-000000000000",
    occurredAt: "2026-11-08T15:00:00.000Z",
    encabezado: { store: { name: "Farmacia Juncos" }, branch: "Centro" },
    cajero: "Ana",
    cliente: "Público general",
    lineas: [
      {
        nombre: "Ibuprofeno",
        cantidad: 2,
        unitarioMinor: 1500,
        descuentoMinor: 0,
      },
      {
        nombre: "Alcohol",
        cantidad: 1,
        unitarioMinor: 2000,
        descuentoMinor: 500,
      },
    ],
    pagos: [{ method: "CASH", amountMinor: 5000 }],
    factura: false,
  };

  it("usa el mismo número que tendrá la venta y calcula el vuelto", () => {
    const ticket = ticketProvisorio(base);
    expect(ticket.number).toBe("94BE5430");
    expect(ticket).toMatchObject({
      subtotalMinor: "5000",
      discountMinor: "500",
      totalMinor: "4500",
      receivedMinor: "5000",
      changeMinor: "500",
      note: LEYENDA_PROVISORIO,
    });
    expect(ticket.items[0]).toEqual({
      name: "Ibuprofeno",
      quantity: 2,
      unitPriceMinor: "1500",
      amountMinor: "3000",
    });
  });

  it("sin efectivo no muestra recibido ni vuelto", () => {
    const ticket = ticketProvisorio({
      ...base,
      pagos: [{ method: "CARD", amountMinor: 4500 }],
    });
    expect(ticket.receivedMinor).toBeUndefined();
    expect(ticket.changeMinor).toBeUndefined();
  });

  it("si pidió factura avisa que se emite al volver internet", () => {
    expect(ticketProvisorio({ ...base, factura: true }).note).toContain(
      "La factura se emite al volver internet",
    );
  });
});

describe("encabezado del ticket", () => {
  beforeEach(() => usarAlmacen(almacenEnMemoria()));

  it("recuerda el último encabezado por sucursal", async () => {
    await recordarEncabezado("o1", "b1", {
      store: { name: "Farmacia Juncos", address: "San Martín 100" },
      branch: "Centro",
    });
    expect(await encabezadoGuardado("o1", "b1")).toEqual({
      store: { name: "Farmacia Juncos", address: "San Martín 100" },
      branch: "Centro",
    });
    expect(await encabezadoGuardado("o1", "b2")).toBeUndefined();
  });
});
