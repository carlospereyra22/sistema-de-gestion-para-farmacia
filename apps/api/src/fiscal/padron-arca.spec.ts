import { cuitValido, datosDePadron } from "./padron-arca";
import { padronFault } from "./arca-soap";

describe("padrón de ARCA", () => {
  it("valida el CUIT con su dígito verificador", () => {
    expect(cuitValido("20-12345678-6")).toBe("20123456786");
    expect(() => cuitValido("20-12345678-5")).toThrow("no es válido");
    expect(() => cuitValido("30111222")).toThrow("11 dígitos");
  });

  it("lee una persona humana responsable inscripta con su domicilio", () => {
    expect(
      datosDePadron("20123456786", {
        datosGenerales: {
          apellido: "PEREZ",
          nombre: "JUAN CARLOS",
          estadoClave: "ACTIVO",
          domicilioFiscal: {
            direccion: "SAN MARTIN 123",
            localidad: "POSADAS",
            descripcionProvincia: "MISIONES",
            codPostal: "3300",
          },
        },
        datosRegimenGeneral: {
          impuesto: [
            { idImpuesto: "30", descripcionImpuesto: "IVA" },
            { idImpuesto: "11", descripcionImpuesto: "GANANCIAS" },
          ],
        },
      }),
    ).toEqual({
      cuit: "20123456786",
      nombre: "PEREZ JUAN CARLOS",
      condicionIva: "Responsable inscripto",
      domicilio: "SAN MARTIN 123",
      localidad: "POSADAS",
      provincia: "MISIONES",
      codigoPostal: "3300",
      estado: "ACTIVO",
    });
  });

  it("monotributo, exento y sin impuestos", () => {
    const con = (extra: Record<string, unknown>) =>
      datosDePadron("30711111112", {
        datosGenerales: { razonSocial: "FARMACIA SA" },
        ...extra,
      })!.condicionIva;
    expect(con({ datosMonotributo: { categoriaMonotributo: "A" } })).toBe(
      "Monotributista",
    );
    expect(
      con({ datosRegimenGeneral: { impuesto: { idImpuesto: "32" } } }),
    ).toBe("Exento");
    expect(con({})).toBe("Consumidor final");
    expect(datosDePadron("1", {})).toBeNull();
  });

  it("traduce los errores de ARCA sin mostrar el mensaje técnico", () => {
    expect(padronFault("No existe persona con ese Id").message).toBe(
      "ARCA no tiene datos para ese CUIT.",
    );
    expect(padronFault("notAuthorized").message).toContain(
      "ws_sr_constancia_inscripcion",
    );
  });
});

describe("código de falla de ARCA", () => {
  it("conserva el código y el texto, sin caracteres raros", () => {
    const { codigoDeFalla } =
      jest.requireActual<typeof import("./arca-soap")>("./arca-soap");
    expect(
      codigoDeFalla({
        faultcode: "ns1:coe.notAuthorized",
        faultstring: "Computador no autorizado a acceder al servicio <x>",
      }),
    ).toBe(
      "ns1:coe.notAuthorized Computador no autorizado a acceder al servicio x",
    );
  });
});
