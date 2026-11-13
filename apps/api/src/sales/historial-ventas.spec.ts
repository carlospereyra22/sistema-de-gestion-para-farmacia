import { rangoDeCodigo, whereHistorialVentas } from "./historial-ventas";

describe("historial de ventas paginado (SISTEMA-104)", () => {
  it("toma los días en hora de Argentina, con el hasta inclusive", () => {
    const where = whereHistorialVentas("org", "suc", {
      from: "2026-10-17",
      to: "2026-10-17",
    });
    expect(where.completedAt).toEqual({
      gte: new Date("2026-10-17T03:00:00.000Z"),
      lt: new Date("2026-10-18T03:00:00.000Z"),
    });
  });

  it("una venta de las 20:14 del 17/10 cae en el 17/10 aunque en UTC sea el 18", () => {
    const where = whereHistorialVentas("org", "suc", {
      from: "2026-10-17",
      to: "2026-10-17",
    });
    const rango = where.completedAt as { gte: Date; lt: Date };
    const venta = new Date("2026-10-17T23:14:35.428Z");
    expect(venta >= rango.gte && venta < rango.lt).toBe(true);
  });

  it("filtra siempre por organización y sucursal", () => {
    expect(whereHistorialVentas("org", "suc", {})).toEqual({
      organizationId: "org",
      branchId: "suc",
    });
  });

  it("busca por el comienzo del código interno como rango de uuid", () => {
    expect(rangoDeCodigo("D7214329")).toEqual({
      gte: "d7214329-0000-0000-0000-000000000000",
      lte: "d7214329-ffff-ffff-ffff-ffffffffffff",
    });
    expect(rangoDeCodigo("d7214329-2b3d")).toEqual({
      gte: "d7214329-2b3d-0000-0000-000000000000",
      lte: "d7214329-2b3d-ffff-ffff-ffffffffffff",
    });
  });

  it("un código imposible no trae ventas en vez de traer todas", () => {
    expect(rangoDeCodigo("hola")).toBeUndefined();
    expect(whereHistorialVentas("org", "suc", { q: "hola" }).id).toEqual({
      in: [],
    });
  });

  it("estado, comprobante y medio de pago", () => {
    expect(
      whereHistorialVentas("org", "suc", {
        status: "CANCELLED",
        documentType: "INVOICE",
        method: "CARD",
      }),
    ).toMatchObject({
      status: "CANCELLED",
      documentType: "INVOICE",
      payments: { some: { method: "CARD" } },
    });
  });
});
