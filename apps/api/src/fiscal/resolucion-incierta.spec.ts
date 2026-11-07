import {
  ESPERA_PARA_LIBERAR_MS,
  comprobanteInexistente,
  decidirIncierto,
  minutosRestantes,
  ultimoAutorizado,
} from "./resolucion-incierta";

const inexistente = {
  Errors: {
    Err: {
      Code: "602",
      Msg: "No existen datos en nuestros registros para los parametros ingresados.",
    },
  },
};

describe("comprobantes inciertos", () => {
  it("reconoce la respuesta de ARCA de comprobante inexistente", () => {
    expect(comprobanteInexistente(inexistente)).toBe(true);
    expect(comprobanteInexistente({ Errors: { Err: [{ Code: "600" }] } })).toBe(
      false,
    );
    expect(
      comprobanteInexistente({
        ...inexistente,
        ResultGet: { CbteDesde: "5", CodAutorizacion: "71234567890123" },
      }),
    ).toBe(false);
  });

  it("sólo confía en el último autorizado si coincide punto y tipo", () => {
    expect(
      ultimoAutorizado({ CbteNro: "41", PtoVta: "3", CbteTipo: "11" }, 3, 11),
    ).toBe(41);
    expect(
      ultimoAutorizado({ CbteNro: "41", PtoVta: "4", CbteTipo: "11" }, 3, 11),
    ).toBeNull();
    expect(
      ultimoAutorizado({ CbteNro: "41", PtoVta: "3", CbteTipo: "13" }, 3, 11),
    ).toBeNull();
    expect(
      ultimoAutorizado(
        { CbteNro: "41", PtoVta: "3", CbteTipo: "11", ...inexistente },
        3,
        11,
      ),
    ).toBeNull();
    expect(
      ultimoAutorizado({ CbteNro: "x", PtoVta: "3", CbteTipo: "11" }, 3, 11),
    ).toBeNull();
  });

  const base = {
    esperaMs: ESPERA_PARA_LIBERAR_MS,
    consultaInexistente: true,
    ultimoAutorizado: 41,
    numeroReservado: 42,
  };

  it("declara no emitido sólo con las tres condiciones", () => {
    expect(decidirIncierto(base)).toBe("NO_EMITIDO");
  });

  it("espera el tiempo mínimo antes de liberar", () => {
    expect(
      decidirIncierto({ ...base, esperaMs: ESPERA_PARA_LIBERAR_MS - 1 }),
    ).toBe("SIGUE_INCIERTO");
  });

  it("no libera si ARCA podría haber usado el número", () => {
    expect(decidirIncierto({ ...base, ultimoAutorizado: 42 })).toBe(
      "SIGUE_INCIERTO",
    );
    expect(decidirIncierto({ ...base, ultimoAutorizado: 50 })).toBe(
      "SIGUE_INCIERTO",
    );
  });

  it("no libera si la consulta no confirma que no existe", () => {
    expect(decidirIncierto({ ...base, consultaInexistente: false })).toBe(
      "SIGUE_INCIERTO",
    );
    expect(decidirIncierto({ ...base, ultimoAutorizado: null })).toBe(
      "SIGUE_INCIERTO",
    );
  });

  it("informa los minutos que faltan", () => {
    expect(minutosRestantes(0)).toBe(10);
    expect(minutosRestantes(ESPERA_PARA_LIBERAR_MS - 1000)).toBe(1);
    expect(minutosRestantes(ESPERA_PARA_LIBERAR_MS * 2)).toBe(1);
  });
});
