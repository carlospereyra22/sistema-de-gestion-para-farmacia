import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import {
  guardarVentaPendiente,
  olvidarEnviadasViejas,
  pendientesDeOtros,
  resumirBandeja,
  suscribirBandeja,
  unidadesPendientes,
  ventasDe,
  type VentaPendiente,
} from "./bandeja-ventas";

const DIA = 24 * 60 * 60 * 1000;

function ventaDePrueba(datos: Partial<VentaPendiente> = {}): VentaPendiente {
  return {
    version: 1,
    id: "v1",
    alcance: "ana@farmacia.ar",
    organizationId: "o1",
    branchId: "b1",
    occurredAt: "2026-11-08T12:00:00.000Z",
    totalMinor: "1000",
    documentType: "INTERNAL",
    cuerpo: {},
    unidades: [{ productId: "p1", cantidad: 1 }],
    ticket: {
      kind: "sale",
      id: "v1",
      number: "V1",
      date: "2026-11-08T12:00:00.000Z",
      store: { name: "Farmacia" },
      branch: "Centro",
      customer: "Público general",
      items: [],
      subtotalMinor: "1000",
      discountMinor: "0",
      totalMinor: "1000",
      payments: [],
    },
    estado: "PENDIENTE",
    intentos: 0,
    ...datos,
  };
}

describe("bandeja de ventas sin conexión", () => {
  beforeEach(() => {
    // Sin canal entre pestañas: en Node dejaría el proceso abierto.
    vi.stubGlobal("BroadcastChannel", undefined);
    usarAlmacen(almacenEnMemoria());
  });

  it("devuelve las ventas del usuario de la más vieja a la más nueva", async () => {
    await guardarVentaPendiente(
      ventaDePrueba({ id: "b", occurredAt: "2026-11-08T12:05:00.000Z" }),
    );
    await guardarVentaPendiente(
      ventaDePrueba({ id: "a", occurredAt: "2026-11-08T12:01:00.000Z" }),
    );
    await guardarVentaPendiente(
      ventaDePrueba({ id: "c", alcance: "beto@farmacia.ar" }),
    );
    expect(
      (await ventasDe("ana@farmacia.ar")).map((venta) => venta.id),
    ).toEqual(["a", "b"]);
  });

  it("cuenta las pendientes de otros usuarios de la PC, no las propias", async () => {
    await guardarVentaPendiente(ventaDePrueba({ id: "propia" }));
    await guardarVentaPendiente(
      ventaDePrueba({ id: "otra", alcance: "beto@farmacia.ar" }),
    );
    await guardarVentaPendiente(
      ventaDePrueba({
        id: "enviada",
        alcance: "beto@farmacia.ar",
        estado: "ENVIADA",
      }),
    );
    expect(await pendientesDeOtros("ana@farmacia.ar")).toBe(1);
  });

  it("borra las enviadas de más de una semana y conserva el resto", async () => {
    const ahora = Date.parse("2026-11-20T12:00:00.000Z");
    await guardarVentaPendiente(
      ventaDePrueba({
        id: "vieja",
        estado: "ENVIADA",
        enviadaEl: new Date(ahora - 8 * DIA).toISOString(),
      }),
    );
    await guardarVentaPendiente(
      ventaDePrueba({
        id: "reciente",
        estado: "ENVIADA",
        enviadaEl: new Date(ahora - 2 * DIA).toISOString(),
      }),
    );
    await guardarVentaPendiente(ventaDePrueba({ id: "pendiente" }));
    await olvidarEnviadasViejas(ahora);
    expect(
      (await ventasDe("ana@farmacia.ar")).map((venta) => venta.id).sort(),
    ).toEqual(["pendiente", "reciente"]);
  });

  it("descuenta del stock sólo lo pendiente de la misma sucursal", () => {
    const unidades = unidadesPendientes(
      [
        ventaDePrueba({
          unidades: [
            { productId: "p1", cantidad: 2 },
            { productId: "p2", cantidad: 1 },
          ],
        }),
        ventaDePrueba({ unidades: [{ productId: "p1", cantidad: 3 }] }),
        ventaDePrueba({ estado: "ENVIADA" }),
        ventaDePrueba({ estado: "RECHAZADA" }),
        ventaDePrueba({ branchId: "b2" }),
      ],
      "o1",
      "b1",
    );
    expect(Object.fromEntries(unidades)).toEqual({ p1: 5, p2: 1 });
  });

  it("resume pendientes y rechazadas", () => {
    expect(
      resumirBandeja([
        ventaDePrueba(),
        ventaDePrueba({ estado: "RECHAZADA" }),
        ventaDePrueba({ estado: "ENVIADA" }),
      ]),
    ).toEqual({ pendientes: 1, rechazadas: 1 });
  });

  it("avisa a los suscriptos cuando se guarda una venta", async () => {
    const oyente = vi.fn();
    const dejar = suscribirBandeja(oyente);
    await guardarVentaPendiente(ventaDePrueba());
    dejar();
    await guardarVentaPendiente(ventaDePrueba({ id: "v2" }));
    expect(oyente).toHaveBeenCalledTimes(1);
  });
});
