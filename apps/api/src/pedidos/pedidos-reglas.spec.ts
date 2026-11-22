import {
  ESTADOS_POR_GRUPO,
  GRUPOS,
  grupoUsaFechas,
  mezclarPedidos,
  resumirPedidos,
  vistaUnificadaDisponible,
} from "./pedidos-reglas";

const pedido = (
  createdAt: string,
  status = "PENDING",
  totalMinor = "1000",
) => ({
  createdAt,
  status,
  totalMinor,
});

describe("pantalla Pedidos (SISTEMA-119)", () => {
  it("agrupa los estados de los dos módulos sin dejar ninguno afuera", () => {
    const catalogo = GRUPOS.flatMap((g) => ESTADOS_POR_GRUPO[g].catalogo);
    const preventa = GRUPOS.flatMap((g) => ESTADOS_POR_GRUPO[g].preventa);
    expect([...catalogo].sort()).toEqual(
      ["CANCELLED", "CONFIRMED", "DELIVERED", "RECEIVED", "REJECTED"].sort(),
    );
    expect([...preventa].sort()).toEqual(
      ["CANCELLED", "DELIVERED", "IN_DELIVERY", "PENDING"].sort(),
    );
    expect(ESTADOS_POR_GRUPO["por-atender"]).toEqual({
      catalogo: ["RECEIVED"],
      preventa: ["PENDING"],
    });
  });

  it("lo abierto se ve sin importar las fechas", () => {
    expect(grupoUsaFechas("por-atender")).toBe(false);
    expect(grupoUsaFechas("en-curso")).toBe(false);
    expect(grupoUsaFechas("entregados")).toBe(true);
    expect(grupoUsaFechas("cerrados")).toBe(true);
    expect(grupoUsaFechas(undefined)).toBe(true);
  });

  it("sólo se pueden unir con los dos módulos habilitados", () => {
    expect(
      vistaUnificadaDisponible({ catalogEnabled: true, preventaEnabled: true }),
    ).toBe(true);
    expect(
      vistaUnificadaDisponible({
        catalogEnabled: true,
        preventaEnabled: false,
      }),
    ).toBe(false);
    expect(
      vistaUnificadaDisponible({
        catalogEnabled: false,
        preventaEnabled: true,
      }),
    ).toBe(false);
  });

  it("mezcla del más nuevo al más viejo, marca el origen y respeta el tope", () => {
    const catalogo = [
      pedido("2026-11-22T15:00:00.000Z"),
      pedido("2026-11-20T10:00:00.000Z"),
    ];
    const preventa = [
      pedido("2026-11-21T09:00:00.000Z"),
      pedido("2026-11-19T09:00:00.000Z"),
    ];
    const todos = mezclarPedidos(catalogo, preventa, 3);
    expect(todos.map((p) => [p.origen, p.pedido.createdAt])).toEqual([
      ["catalogo", "2026-11-22T15:00:00.000Z"],
      ["preventa", "2026-11-21T09:00:00.000Z"],
      ["catalogo", "2026-11-20T10:00:00.000Z"],
    ]);
  });

  it("el total no suma rechazados ni cancelados y no usa float", () => {
    const resumen = resumirPedidos([
      { pedido: pedido("a", "DELIVERED", "9007199254740993") },
      { pedido: pedido("b", "RECEIVED", "7") },
      { pedido: pedido("c", "REJECTED", "500") },
      { pedido: pedido("d", "CANCELLED", "500") },
    ]);
    expect(resumen).toEqual({ cantidad: 2, totalMinor: "9007199254741000" });
  });
});
