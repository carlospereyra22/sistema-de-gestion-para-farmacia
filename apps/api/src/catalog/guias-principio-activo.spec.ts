import { INTERVALO } from "./guias-dosis";
import { DOSIS_ORIENTATIVAS } from "./guias-dosis.data";
import {
  claveGuia,
  guiasDesdePadron,
  vinculosPadron,
} from "./guias-principio-activo";

const fila = (datos: Record<string, unknown>) => ({
  DROGA: "ibuprofeno",
  ACCION: "Analgésico Antiinflam.",
  VIA: "oral",
  BAJA: "0",
  ...datos,
});

describe("guías por principio activo", () => {
  it("normaliza tildes, mayúsculas y espacios", () => {
    expect(claveGuia("  Losartán   ")).toBe("losartan");
    expect(claveGuia("valsartán+hidroclorotiazida")).toBe(
      "valsartan+hidroclorotiazida",
    );
  });

  it("toma la acción y la vía más frecuentes y suma la dosis", () => {
    const [guia] = guiasDesdePadron(
      [fila({}), fila({}), fila({ ACCION: "Analgésico", VIA: "tópica" })],
      { Ibuprofeno: { uso: "Dolor.", dosis: "400 mg cada 8 h." } },
    );
    expect(guia).toEqual({
      activeKey: "ibuprofeno",
      activeIngredient: "ibuprofeno",
      therapeuticAction: "Analgésico Antiinflam.",
      route: "oral",
      usage: "Dolor.",
      dosage: "400 mg cada 8 h.",
      dosageSource: "ia",
    });
  });

  it("las dadas de baja no pisan a las vigentes", () => {
    const [guia] = guiasDesdePadron(
      [
        fila({ BAJA: "1", ACCION: "Vieja" }),
        fila({ BAJA: "1", ACCION: "Vieja" }),
        fila({}),
      ],
      {},
    );
    expect(guia?.therapeuticAction).toBe("Analgésico Antiinflam.");
    expect(guia?.dosageSource).toBe("");
  });

  it("toda dosis lleva intervalo en horas (o días, o dosis única)", () => {
    const sinIntervalo = Object.entries(DOSIS_ORIENTATIVAS)
      .filter(([, valor]) => !INTERVALO.test(valor.dosis))
      .map(([droga, valor]) => `${droga}: ${valor.dosis}`);
    expect(sinIntervalo).toEqual([]);
  });

  it("el archivo de dosis no tiene textos vacíos", () => {
    for (const [droga, valor] of Object.entries(DOSIS_ORIENTATIVAS)) {
      expect(`${droga}: ${valor.uso}`).not.toMatch(/: $/);
      expect(valor.dosis.trim()).not.toBe("");
    }
  });
});

describe("vínculos con el padrón", () => {
  it("vincula por CLAVE y por código, y descarta códigos ambiguos", () => {
    const vinculos = vinculosPadron([
      fila({ CLAVE: 1649, DROGA: "hioscina,n-butilbr.", C_BARRA: "0779001" }),
      fila({ CLAVE: 2, DROGA: "propinox", C_BARRA: "7790002" }),
      fila({ CLAVE: 3, DROGA: "otra", C_BARRA: "7790002" }),
    ]);
    expect(vinculos.porClave).toContainEqual({
      externalKey: "ab-1649",
      activeKey: "hioscina,n-butilbr.",
      therapeuticAction: "Analgésico Antiinflam.",
    });
    expect(vinculos.porCodigo).toEqual([
      { codigo: "779001", activeKey: "hioscina,n-butilbr." },
    ]);
  });
});
