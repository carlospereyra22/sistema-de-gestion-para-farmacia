import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import {
  guardarVentaPendiente,
  ventasDe,
  ventasDeLaPc,
  type VentaPendiente,
} from "./bandeja-ventas";
import {
  EnvioRechazado,
  conCandado,
  rechazoDefinitivo,
  sincronizarVentas,
} from "./sincronizacion-ventas";

const ALCANCE = "ana@farmacia.ar";

function venta(
  id: string,
  minuto: number,
  datos: Partial<VentaPendiente> = {},
) {
  const occurredAt = `2026-11-08T12:${String(minuto).padStart(2, "0")}:00.000Z`;
  const pendiente: VentaPendiente = {
    version: 1,
    id,
    alcance: ALCANCE,
    organizationId: "o1",
    branchId: "b1",
    occurredAt,
    totalMinor: "1000",
    documentType: "INTERNAL",
    cuerpo: { clientOperationId: id },
    unidades: [],
    ticket: {
      kind: "sale",
      id,
      number: id,
      date: occurredAt,
      store: { name: "Farmacia" },
      branch: "Centro",
      customer: "Público general",
      items: [],
      totalMinor: "1000",
      payments: [],
    },
    estado: "PENDIENTE",
    intentos: 0,
    ...datos,
  };
  return pendiente;
}

const estados = async () =>
  Object.fromEntries(
    (await ventasDe(ALCANCE)).map((item) => [item.id, item.estado]),
  );

describe("envío de ventas hechas sin conexión", () => {
  beforeEach(async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    usarAlmacen(almacenEnMemoria());
    await guardarVentaPendiente(venta("b", 2));
    await guardarVentaPendiente(venta("a", 1));
    await guardarVentaPendiente(venta("c", 3));
  });

  it("manda de la más vieja a la más nueva y guarda cuántos avisos volvieron", async () => {
    const orden: string[] = [];
    const resultado = await sincronizarVentas({
      alcance: ALCANCE,
      enviar: (item) => {
        orden.push(item.id);
        return Promise.resolve({
          offlineIssues: item.id === "b" ? [{}, {}] : [],
        });
      },
      ahora: () => new Date("2026-11-08T13:00:00.000Z"),
    });
    expect(orden).toEqual(["a", "b", "c"]);
    expect(resultado).toEqual({
      enviadas: 3,
      rechazadas: 0,
      interrumpida: false,
    });
    const b = (await ventasDe(ALCANCE)).find((item) => item.id === "b");
    expect(b).toMatchObject({
      estado: "ENVIADA",
      avisos: 2,
      intentos: 1,
      enviadaEl: "2026-11-08T13:00:00.000Z",
    });
  });

  it("un rechazo definitivo queda para revisar y sigue con las demás", async () => {
    const resultado = await sincronizarVentas({
      alcance: ALCANCE,
      enviar: (item) =>
        item.id === "a"
          ? Promise.reject(
              new EnvioRechazado("Sin permiso en la sucursal", 403),
            )
          : Promise.resolve({}),
    });
    expect(resultado).toEqual({
      enviadas: 2,
      rechazadas: 1,
      interrumpida: false,
    });
    expect(await estados()).toEqual({
      a: "RECHAZADA",
      b: "ENVIADA",
      c: "ENVIADA",
    });
    const a = (await ventasDe(ALCANCE)).find((item) => item.id === "a");
    expect(a?.ultimoError).toBe("Sin permiso en la sucursal");
  });

  it("si se corta la conexión frena y respeta el orden para después", async () => {
    const enviar = vi.fn((item: VentaPendiente) =>
      item.id === "b"
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve({}),
    );
    const resultado = await sincronizarVentas({ alcance: ALCANCE, enviar });
    expect(resultado).toEqual({
      enviadas: 1,
      rechazadas: 0,
      interrumpida: true,
    });
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(await estados()).toEqual({
      a: "ENVIADA",
      b: "PENDIENTE",
      c: "PENDIENTE",
    });
    const b = (await ventasDe(ALCANCE)).find((item) => item.id === "b");
    expect(b).toMatchObject({ intentos: 1, ultimoError: "Failed to fetch" });
  });

  it("una sesión vencida o un error del servidor se reintentan", async () => {
    for (const status of [401, 500]) {
      const resultado = await sincronizarVentas({
        alcance: ALCANCE,
        enviar: () => Promise.reject(new EnvioRechazado("Error", status)),
      });
      expect(resultado.interrumpida).toBe(true);
    }
    expect(await estados()).toEqual({
      a: "PENDIENTE",
      b: "PENDIENTE",
      c: "PENDIENTE",
    });
  });

  it("no vuelve a mandar las enviadas ni las rechazadas", async () => {
    await guardarVentaPendiente(venta("a", 1, { estado: "ENVIADA" }));
    await guardarVentaPendiente(venta("b", 2, { estado: "RECHAZADA" }));
    const enviar = vi.fn(() => Promise.resolve({}));
    await sincronizarVentas({ alcance: ALCANCE, enviar });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("clasifica qué rechazos son definitivos", () => {
    expect([400, 402, 403, 404, 409, 422].every(rechazoDefinitivo)).toBe(true);
    expect([401, 408, 429, 500, 503].some(rechazoDefinitivo)).toBe(false);
  });

  it("no arranca otra sincronización mientras hay una en curso", async () => {
    let soltar = () => {};
    const primera = conCandado(
      () =>
        new Promise<string>((resolve) => {
          soltar = () => resolve("primera");
        }),
    );
    const segunda = await conCandado(() => Promise.resolve("segunda"));
    soltar();
    expect(segunda).toBeUndefined();
    expect(await primera).toBe("primera");
    expect(await conCandado(() => Promise.resolve("tercera"))).toBe("tercera");
  });
});

describe("ventas de otros usuarios de la PC (cambio de turno)", () => {
  beforeEach(async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    usarAlmacen(almacenEnMemoria());
    await guardarVentaPendiente(venta("propia", 1));
    await guardarVentaPendiente(
      venta("firmada", 2, {
        alcance: "beto@farmacia.ar",
        vendedorId: "beto",
        payload: "{}",
        firma: "firma",
      }),
    );
    await guardarVentaPendiente(
      venta("sin-firma", 3, { alcance: "carla@farmacia.ar" }),
    );
  });

  it("manda las firmadas por su dueño y deja las que no tienen firma", async () => {
    const enviarDeOtro = vi.fn(() => Promise.resolve({}));
    const resultado = await sincronizarVentas({
      alcance: ALCANCE,
      enviar: () => Promise.resolve({}),
      enviarDeOtro,
    });
    expect(resultado.enviadas).toBe(2);
    expect(enviarDeOtro).toHaveBeenCalledTimes(1);
    const estados = Object.fromEntries(
      (await ventasDeLaPc()).map((item) => [item.id, item.estado]),
    );
    expect(estados).toEqual({
      propia: "ENVIADA",
      firmada: "ENVIADA",
      "sin-firma": "PENDIENTE",
    });
  });

  it("si esta sesión no puede mandarla, queda para su dueño sin marcarla rechazada", async () => {
    for (const status of [403, 404, 409]) {
      await sincronizarVentas({
        alcance: ALCANCE,
        enviar: () => Promise.resolve({}),
        enviarDeOtro: () => Promise.reject(new EnvioRechazado("No", status)),
      });
      const firmada = (await ventasDeLaPc()).find(
        (item) => item.id === "firmada",
      );
      expect(firmada?.estado).toBe("PENDIENTE");
    }
  });

  it("una firma inválida sí queda rechazada para revisar", async () => {
    await sincronizarVentas({
      alcance: ALCANCE,
      enviar: () => Promise.resolve({}),
      enviarDeOtro: () =>
        Promise.reject(new EnvioRechazado("La firma no es válida", 400)),
    });
    expect(
      (await ventasDeLaPc()).find((item) => item.id === "firmada")?.estado,
    ).toBe("RECHAZADA");
  });

  it("sin envío para otros, sólo manda las propias", async () => {
    const resultado = await sincronizarVentas({
      alcance: ALCANCE,
      enviar: () => Promise.resolve({}),
    });
    expect(resultado.enviadas).toBe(1);
  });
});

describe("orden con la caja (SISTEMA-67)", () => {
  beforeEach(() => {
    vi.stubGlobal("BroadcastChannel", undefined);
    usarAlmacen(almacenEnMemoria());
  });

  it("si la apertura de otro no se puede mandar, la venta que vino después espera", async () => {
    await guardarVentaPendiente(
      venta("apertura", 1, {
        alcance: "beto@farmacia.ar",
        operacion: "CAJA",
      }),
    );
    await guardarVentaPendiente(venta("venta-propia", 2));
    const enviar = vi.fn(() => Promise.resolve({}));
    const resultado = await sincronizarVentas({
      alcance: ALCANCE,
      enviar,
      enviarDeOtro: () => Promise.resolve({}),
    });
    expect(enviar).not.toHaveBeenCalled();
    expect(resultado.enviadas).toBe(0);
  });
});
