import { beforeEach, describe, expect, it, vi } from "vitest";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import type { Party } from "./api";
import { ventasDeLaPc } from "./bandeja-ventas";
import { activarSesionGuardada } from "./cache-local";
import {
  camposCambiados,
  guardarOperacionProveedor,
  operacionProveedorTexto,
  proveedorConPendientes,
  proveedoresConPendientes,
  proveedorSinEnviar,
} from "./proveedores-sin-conexion";

const drogueria: Party = {
  id: "s1",
  name: "Droguería Sur",
  phone: "351 111",
  email: null,
  contactName: null,
  address: null,
  notes: null,
  accountEnabled: true,
  accountTermDays: 30,
  active: true,
};

describe("proveedores sin conexión", () => {
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

  it("el alta sin conexión se ve enseguida en la lista, por enviar y con el id de la PC", async () => {
    const op = await guardarOperacionProveedor("o1", "b1", {
      tipo: "ALTA",
      cuerpo: {
        name: " Laboratorio Norte ",
        accountEnabled: false,
        accountTermDays: 15,
      },
    });
    const bandeja = await ventasDeLaPc();
    expect(bandeja[0]).toMatchObject({
      operacion: "PROVEEDOR",
      actorName: "Ana",
    });
    const lista = proveedoresConPendientes([drogueria], bandeja, "o1");
    expect(lista.map((p) => p.name)).toEqual([
      "Droguería Sur",
      "Laboratorio Norte",
    ]);
    expect(lista[1]).toMatchObject({
      id: op.clientOperationId,
      porEnviar: true,
      accountTermDays: null,
    });
    expect(proveedorSinEnviar(bandeja, "o1", op.clientOperationId)).toBe(true);
    expect(proveedorSinEnviar(bandeja, "o1", "s1")).toBe(false);
    expect(operacionProveedorTexto(bandeja[0]!)).toBe(
      "Alta de proveedor · Laboratorio Norte",
    );
  });

  it("la edición y la baja sin conexión cambian lo que se ve", async () => {
    await guardarOperacionProveedor("o1", "b1", {
      tipo: "EDICION",
      supplierId: "s1",
      cuerpo: { phone: "0800 222", accountEnabled: false },
    });
    await guardarOperacionProveedor("o1", "b1", {
      tipo: "ESTADO",
      supplierId: "s1",
      cuerpo: { active: false },
    });
    const bandeja = await ventasDeLaPc();
    const [proveedor] = proveedoresConPendientes([drogueria], bandeja, "o1");
    expect(proveedor).toMatchObject({
      phone: "0800 222",
      accountEnabled: false,
      accountTermDays: null,
      active: false,
      porEnviar: true,
    });
    // Lo nuevo de ese proveedor va detrás, en la PC; no es un alta sin enviar.
    expect(proveedorConPendientes(bandeja, "o1", "s1")).toBe(true);
    expect(proveedorSinEnviar(bandeja, "o1", "s1")).toBe(false);
  });

  it("sin conexión sólo se mandan los campos que cambiaron", () => {
    expect(
      camposCambiados(drogueria, {
        name: "Droguería Sur",
        phone: "351 999",
        email: "",
        contactName: "",
        address: "",
        notes: "Entrega martes",
        accountEnabled: true,
        accountTermDays: 30,
      }),
    ).toEqual({ phone: "351 999", notes: "Entrega martes" });
    expect(
      camposCambiados(drogueria, {
        name: "Droguería Sur",
        phone: "351 111",
        accountEnabled: false,
        accountTermDays: null,
      }),
    ).toEqual({ accountEnabled: false, accountTermDays: null });
  });
});
