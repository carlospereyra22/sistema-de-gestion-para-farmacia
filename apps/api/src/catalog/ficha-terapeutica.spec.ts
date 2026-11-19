import { elegirFichaTerapeutica } from "./ficha-terapeutica";

const ibupirac = {
  NOMBRE: "IBUPIRAC SUSPENSION 2%",
  PRESENTACION: "susp.x 110 ml",
  LABORATORIO: "Pfizer",
  DROGA: "ibuprofeno",
  FORMA: "Jarabe/Suspensión oral/Polvo para uso oral",
  TIPO_DE_VENTA: "Venta Libre",
  C_BARRA: "7795381411387",
  GTIN1: "07795381411387",
  ACCION: "Analgésico Antiinflam.",
  VIA: "oral",
};

describe("ficha terapéutica del padrón", () => {
  it("elige la fila por código de barras, aunque tenga ceros adelante", () => {
    const ficha = elegirFichaTerapeutica([ibupirac], {
      nombre: "otro nombre",
      codigos: ["07795381411387"],
    });
    expect(ficha).toMatchObject({
      accionTerapeutica: "Analgésico Antiinflam.",
      via: "oral",
      principioActivo: "ibuprofeno",
      condicionVenta: "Venta Libre",
      coincidencia: "codigo",
    });
  });

  it("sin código usa el nombre exacto, sin tildes ni mayúsculas", () => {
    expect(
      elegirFichaTerapeutica([ibupirac], {
        nombre: "Ibupirac suspension 2%",
        codigos: [],
      })?.coincidencia,
    ).toBe("nombre");
  });

  it("no adivina si filas con el mismo nombre tienen acciones distintas", () => {
    expect(
      elegirFichaTerapeutica(
        [ibupirac, { ...ibupirac, C_BARRA: "1", ACCION: "Antifebril" }],
        { nombre: ibupirac.NOMBRE, codigos: [] },
      ),
    ).toBeNull();
  });

  it("ignora filas sin acción terapéutica y nombres parecidos", () => {
    expect(
      elegirFichaTerapeutica([{ ...ibupirac, ACCION: " " }], {
        nombre: ibupirac.NOMBRE,
        codigos: [ibupirac.C_BARRA],
      }),
    ).toBeNull();
    expect(
      elegirFichaTerapeutica([ibupirac], { nombre: "IBUPIRAC", codigos: [] }),
    ).toBeNull();
  });
});
