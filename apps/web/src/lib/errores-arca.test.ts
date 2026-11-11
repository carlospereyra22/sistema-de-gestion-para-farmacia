import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorDeArca, fiscalTesting } from "./api";
import { SinConexionError } from "./api-fetch";
import { conectividad, marcarEnLinea } from "./conectividad";
import { traducirErrorDeArca } from "./errores-arca";

afterEach(() => vi.unstubAllGlobals());

const rechazo = (mensaje: string, falla?: string) =>
  new ErrorDeArca(mensaje, "ARCA_RECHAZO", falla);

describe("probar conexión con ARCA en palabras simples (SISTEMA-97)", () => {
  it.each([
    [
      rechazo(
        "ARCA rechazó la conexión. En WSASS autorizá el alias para el servicio wsfe y el CUIT representado.",
        "ns1:coe.notAuthorized Computador no autorizado a acceder al servicio",
      ),
      "no-autorizado",
      "Falta autorizar la factura electrónica",
    ],
    [
      new Error(
        "Cambió el CUIT de la farmacia. Revisá su configuración antes de conectar.",
      ),
      "cuit",
      "El CUIT no coincide",
    ],
    [
      new Error("Cargá un certificado vigente del ambiente seleccionado."),
      "sin-certificado",
      "Falta un certificado vigente",
    ],
    [
      new Error("El certificado está vencido."),
      "vencido",
      "El certificado venció",
    ],
    [
      rechazo(
        "ARCA rechazó la conexión. El certificado no fue aceptado por homologación.",
        "ns1:cms.cert.untrusted",
      ),
      "no-aceptado",
      "ARCA no acepta este certificado",
    ],
    [
      rechazo(
        "ARCA rechazó la conexión. ARCA ya emitió un acceso vigente para este certificado.",
        "ns1:coe.alreadyAuthenticated",
      ),
      "otra-instalacion",
      "ARCA ya dio un acceso a este certificado",
    ],
    [
      new ErrorDeArca(
        "No se pudo completar la comunicación con ARCA homologación.",
        "ARCA_SIN_RESPUESTA",
      ),
      "sin-conexion",
      "Sin conexión con ARCA",
    ],
    [new SinConexionError(), "sin-conexion", "Sin conexión con ARCA"],
    [new Error("Algo raro"), "otro", "No se pudo conectar con ARCA"],
  ])("%s → %s", (error, tipo, titulo) => {
    const resultado = traducirErrorDeArca(error);
    expect(resultado.tipo).toBe(tipo);
    expect(resultado.titulo).toBe(titulo);
    expect(resultado.queHacer.length).toBeGreaterThan(20);
  });

  it("conserva el detalle técnico con el código de ARCA", () => {
    const resultado = traducirErrorDeArca(
      rechazo("ARCA rechazó la conexión.", "ns1:coe.notAuthorized"),
    );
    expect(resultado.detalle).toBe(
      "ARCA rechazó la conexión. · Código de ARCA: ns1:coe.notAuthorized",
    );
    // El texto principal no usa jerga.
    expect(resultado.titulo + resultado.queHacer).not.toMatch(/WSAA|coe\./);
  });

  it("un rechazo de ARCA no pasa la app a sin conexión", async () => {
    marcarEnLinea();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ARCA_RECHAZO",
            message: "ARCA rechazó la conexión.",
            details: { codigo: "ns1:coe.notAuthorized" },
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const error = await fiscalTesting("t", "o", "connect", {}).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(ErrorDeArca);
    expect((error as ErrorDeArca).falla).toBe("ns1:coe.notAuthorized");
    expect(conectividad().enLinea).toBe(true);
  });
});
