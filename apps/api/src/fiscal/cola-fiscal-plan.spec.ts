import {
  ENVIO_EN_CURSO_MS,
  ESPERA_ENTRE_INTENTOS_MS,
  GRACIA_VENTA_NUEVA_MS,
  planificarCola,
  seguirConElGrupo,
  type Pendiente,
} from "./cola-fiscal-plan";

const ahora = Date.parse("2026-11-07T15:00:00Z");
const hace = (ms: number) => new Date(ahora - ms);
const minuto = 60_000;

function pendiente(
  id: string,
  datos: Partial<Pendiente> & { creadoHace?: number } = {},
): Pendiente {
  return {
    id,
    grupo: "prod:20247237837:3",
    estado: "QUEUED",
    creado: hace(datos.creadoHace ?? 10 * minuto),
    actualizado: hace(datos.creadoHace ?? 10 * minuto),
    ventaAnulada: false,
    ...datos,
  };
}
const nunca = () => undefined;
const ids = (plan: Pendiente[][]) =>
  plan.map((grupo) => grupo.map((p) => p.id));

describe("plan de la cola fiscal", () => {
  it("envía del más viejo al más nuevo, por punto de venta", () => {
    const plan = planificarCola(
      [
        pendiente("c", { creadoHace: 5 * minuto }),
        pendiente("a", { creadoHace: 30 * minuto }),
        pendiente("b", { creadoHace: 20 * minuto }),
        pendiente("x", { grupo: "prod:20247237837:4" }),
      ],
      ahora,
      nunca,
    );
    expect(ids(plan)).toEqual([["a", "b", "c"], ["x"]]);
  });

  it("primero concilia lo que traba el punto", () => {
    const plan = planificarCola(
      [
        pendiente("cola", { creadoHace: 30 * minuto }),
        pendiente("incierto", {
          estado: "UNCERTAIN",
          creadoHace: 5 * minuto,
        }),
      ],
      ahora,
      nunca,
    );
    expect(ids(plan)).toEqual([["incierto", "cola"]]);
  });

  it("no toca un punto con un envío en curso", () => {
    const plan = planificarCola(
      [
        pendiente("cola"),
        pendiente("enviando", {
          estado: "PENDING",
          actualizado: hace(ENVIO_EN_CURSO_MS - 1000),
        }),
      ],
      ahora,
      nunca,
    );
    expect(plan).toEqual([]);
  });

  it("un envío colgado hace rato se concilia", () => {
    const plan = planificarCola(
      [
        pendiente("colgado", {
          estado: "PENDING",
          actualizado: hace(ENVIO_EN_CURSO_MS + 1000),
        }),
      ],
      ahora,
      nunca,
    );
    expect(ids(plan)).toEqual([["colgado"]]);
  });

  it("no envía facturas de ventas anuladas", () => {
    const plan = planificarCola(
      [pendiente("anulada", { ventaAnulada: true }), pendiente("ok")],
      ahora,
      nunca,
    );
    expect(ids(plan)).toEqual([["ok"]]);
  });

  it("deja que la venta recién hecha envíe su propia factura", () => {
    const plan = planificarCola(
      [
        pendiente("nueva", { creadoHace: GRACIA_VENTA_NUEVA_MS - 1000 }),
        pendiente("vieja"),
      ],
      ahora,
      nunca,
    );
    expect(ids(plan)).toEqual([["vieja"]]);
  });

  it("espera antes de reintentar un comprobante que falló", () => {
    const intentos = new Map([["fallo", ahora - ESPERA_ENTRE_INTENTOS_MS + 1]]);
    const plan = planificarCola(
      [pendiente("fallo", { creadoHace: 30 * minuto }), pendiente("siguiente")],
      ahora,
      (id) => intentos.get(id),
    );
    expect(ids(plan)).toEqual([["siguiente"]]);
    intentos.set("fallo", ahora - ESPERA_ENTRE_INTENTOS_MS);
    expect(
      ids(
        planificarCola([pendiente("fallo")], ahora, (id) => intentos.get(id)),
      ),
    ).toEqual([["fallo"]]);
  });

  it("si lo que traba el punto se consultó hace poco, espera todo el punto", () => {
    const plan = planificarCola(
      [pendiente("incierto", { estado: "UNCERTAIN" }), pendiente("cola")],
      ahora,
      (id) => (id === "incierto" ? ahora - minuto : undefined),
    );
    expect(plan).toEqual([]);
  });

  it("frena el punto si queda sin confirmar o falla varias veces seguidas", () => {
    expect(seguirConElGrupo("AUTHORIZED", 0)).toBe(true);
    expect(seguirConElGrupo("REJECTED", 0)).toBe(true);
    expect(seguirConElGrupo("QUEUED", 2)).toBe(true);
    expect(seguirConElGrupo("QUEUED", 3)).toBe(false);
    expect(seguirConElGrupo("UNCERTAIN", 0)).toBe(false);
    expect(seguirConElGrupo("PENDING", 0)).toBe(false);
  });
});
