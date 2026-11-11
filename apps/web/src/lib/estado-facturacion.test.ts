import { describe, expect, it } from "vitest";
import type { FiscalSetup } from "./api";
import { estadoDeFacturacion, sucursalesSinPunto } from "./estado-facturacion";

type Listos = Partial<
  Record<"PROFILE" | "AUTH" | "POINT" | "TRIAL" | "PRODUCTION", boolean>
>;

function setup(
  listos: Listos = {},
  extra: Partial<FiscalSetup> = {},
): FiscalSetup {
  const centro = { id: "b1", name: "Centro" };
  return {
    environment: "HOMOLOGATION",
    issuanceEnabled: false,
    branches: [centro],
    points: listos.POINT
      ? [{ id: "p1", branchId: "b1", number: 1, active: true }]
      : [],
    checks: (["PROFILE", "AUTH", "POINT", "TRIAL", "PRODUCTION"] as const).map(
      (code) => ({
        code,
        ready: listos[code] ?? false,
        label: code,
        detail: `detalle ${code}`,
      }),
    ),
    trial: null,
    production: { available: true, branches: [] },
    ...extra,
  };
}

const estados = (valor: FiscalSetup, vat?: string) =>
  estadoDeFacturacion(valor, vat).pasos.map(({ estado }) => estado);

describe("estado de la facturación de punta a punta (SISTEMA-95)", () => {
  it("sin nada configurado: primer paso y producción bloqueada", () => {
    const estado = estadoDeFacturacion(setup());
    expect(estado.titulo).toBe("Todavía no configuraste la facturación");
    expect(estado.siguiente).toBe(0);
    expect(estado.porcentaje).toBe(0);
    expect(estados(setup())).toEqual([
      "pendiente",
      "pendiente",
      "pendiente",
      "pendiente",
      "bloqueado",
    ]);
    expect(estado.pasos[4]!.detalle).toBe(
      "Se habilita cuando termines: Datos de la farmacia, Conexión con ARCA, Punto de venta, Factura de prueba.",
    );
  });

  it.each([
    [
      { PROFILE: true },
      1,
      "Te faltan 3 pasos para hacer tu primera factura de prueba",
    ],
    [
      { PROFILE: true, AUTH: true },
      2,
      "Te faltan 2 pasos para hacer tu primera factura de prueba",
    ],
    [
      { PROFILE: true, AUTH: true, POINT: true },
      3,
      "Te falta 1 paso para hacer tu primera factura de prueba",
    ],
    [
      { PROFILE: true, POINT: true },
      1,
      "Te faltan 2 pasos para hacer tu primera factura de prueba",
    ],
  ] as const)("con %o sigue en el paso %s", (listos, siguiente, titulo) => {
    const estado = estadoDeFacturacion(setup(listos));
    expect(estado.siguiente).toBe(siguiente);
    expect(estado.titulo).toBe(titulo);
  });

  it("con la prueba hecha queda lista en pruebas y sigue a la real", () => {
    const valor = setup({
      PROFILE: true,
      AUTH: true,
      POINT: true,
      TRIAL: true,
    });
    const estado = estadoDeFacturacion(valor);
    expect(estado.titulo).toBe("Lista para facturar en pruebas");
    expect(estado.siguiente).toBe(4);
    expect(estado.pasos[4]!.estado).toBe("pendiente");
    expect(estado.porcentaje).toBe(80);
  });

  it("si el servidor no permite la real, lo dice sin errores técnicos", () => {
    const valor = setup(
      { PROFILE: true, AUTH: true, POINT: true, TRIAL: true },
      { production: { available: false, branches: [] } },
    );
    const real = estadoDeFacturacion(valor).pasos[4]!;
    expect(real.estado).toBe("problema");
    expect(real.detalle).toBe("Lo habilita el administrador del sistema.");
  });

  it("facturando en real: sin próximo paso", () => {
    const estado = estadoDeFacturacion(
      setup({
        PROFILE: true,
        AUTH: true,
        POINT: true,
        TRIAL: true,
        PRODUCTION: true,
      }),
    );
    expect(estado.titulo).toBe("Facturando en real");
    expect(estado.siguiente).toBeUndefined();
    expect(estado.porcentaje).toBe(100);
  });

  it("una prueba rechazada o sin respuesta marca el paso con problema", () => {
    for (const status of ["REJECTED", "UNCERTAIN", "PENDING"]) {
      const valor = setup(
        { PROFILE: true, AUTH: true, POINT: true },
        {
          trial: {
            status,
            point: 1,
            number: 1,
            cae: null,
            createdAt: "2026-11-11T12:00:00Z",
          },
        },
      );
      expect(estados(valor)[3]).toBe("problema");
    }
  });

  it("responsable inscripto: datos con problema (hoy sólo factura C)", () => {
    const pasos = estadoDeFacturacion(
      setup({ PROFILE: true }),
      "REGISTERED",
    ).pasos;
    expect(pasos[0]!.estado).toBe("problema");
    expect(pasos[0]!.detalle).toContain("sólo emite factura C");
  });

  it("el punto de venta se completa cuando todas las sucursales tienen uno", () => {
    const valor = setup(
      { PROFILE: true, AUTH: true, POINT: true },
      {
        branches: [
          { id: "b1", name: "Centro" },
          { id: "b2", name: "Norte" },
        ],
      },
    );
    expect(sucursalesSinPunto(valor)).toEqual([{ id: "b2", name: "Norte" }]);
    const punto = estadoDeFacturacion(valor).pasos[2]!;
    expect(punto.estado).toBe("pendiente");
    expect(punto.detalle).toBe(
      "1 de 2 sucursales con punto de venta. Falta: Norte.",
    );
  });
});
