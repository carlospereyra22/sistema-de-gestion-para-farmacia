import { describe, expect, it } from "vitest";
import {
  codigosParaFicha,
  esPresentacionPediatrica,
  linkBusquedaProspecto,
  resumenFicha,
} from "./ficha-terapeutica";

const guia = {
  activeIngredient: "ibuprofeno",
  therapeuticAction: "Analgésico Antiinflam.",
  route: "oral",
  usage: "Dolor, fiebre e inflamación.",
  dosage: "400 mg cada 6-8 h.",
  dosageSource: "ia",
};

describe("ficha terapéutica", () => {
  it("envía solo códigos numéricos válidos y sin repetir", () => {
    expect(
      codigosParaFicha(["7795381411387", " 7795381411387 ", "INT-1", "123"]),
    ).toEqual(["7795381411387"]);
  });

  it("arma la búsqueda del prospecto con nombre y laboratorio", () => {
    const url = new URL(linkBusquedaProspecto("Ibupirac 400", "Pfizer"));
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("q")).toBe("prospecto Ibupirac 400 Pfizer");
  });

  it("usa el uso de la guía y deja la acción del padrón como dato extra", () => {
    expect(resumenFicha({ guia, ficha: null })).toMatchObject({
      paraQueSirve: "Dolor, fiebre e inflamación.",
      accionTerapeutica: "Analgésico Antiinflam.",
      dosis: "400 mg cada 6-8 h.",
      dosisGeneradaConIa: true,
      via: "oral",
    });
  });

  it("sin uso cargado muestra la acción terapéutica y no marca IA", () => {
    expect(
      resumenFicha({
        guia: { ...guia, usage: "", dosage: "", dosageSource: "" },
        ficha: null,
      }),
    ).toMatchObject({
      paraQueSirve: "Analgésico Antiinflam.",
      accionTerapeutica: "",
      dosis: "",
      dosisGeneradaConIa: false,
    });
    expect(resumenFicha({ guia: null, ficha: null })).toBeNull();
  });

  it("detecta presentaciones líquidas o pediátricas", () => {
    expect(esPresentacionPediatrica("IBUPIRAC 2%", "susp.x 90 ml")).toBe(true);
    expect(esPresentacionPediatrica("NOVALGINA", "gts.x 20 ml")).toBe(true);
    expect(esPresentacionPediatrica("ACTRON PEDIATRICO 4%", "")).toBe(true);
    expect(esPresentacionPediatrica("NOVALGINA", "comp.x 10")).toBe(false);
  });
  it("usa el prospecto de la marca y completa con la guía lo que falta", () => {
    const monografia = {
      name: "VOLTAREN EMULGEL",
      laboratory: "HALEON ARG",
      therapeuticAction: "Analgésico-antiinflamatorio de uso tópico.",
      composition: "Cada 100 g contiene: Diclofenaco Dietilamónico 1.16 g.",
      indications: "Alivio del dolor y la inflamación localizada.",
      dosage: "Tópica. Aplicar 3 a 4 veces al día.",
      presentations: "Envases de 30, 60 y 100 g.",
      sourceUrl:
        "https://ar.prvademecum.com/medicamento/voltaren-emulgel-13689/",
      via: "uso externo",
    };
    const completo = resumenFicha({ guia, ficha: null, monografia });
    expect(completo).toMatchObject({
      paraQueSirve: "Alivio del dolor y la inflamación localizada.",
      dosis: "Tópica. Aplicar 3 a 4 veces al día.",
      dosisGeneradaConIa: false,
      deProspecto: true,
      via: "uso externo",
      fuente: { nombre: "PR Vademécum" },
    });
    // Sin modo de uso en la ficha: la dosis de la guía, marcada como tal.
    const sinUso = resumenFicha({
      guia,
      ficha: null,
      monografia: { ...monografia, dosage: "" },
    });
    expect(sinUso).toMatchObject({
      paraQueSirve: "Alivio del dolor y la inflamación localizada.",
      dosis: "400 mg cada 6-8 h.",
      dosisGeneradaConIa: true,
      deProspecto: false,
    });
  });
});
