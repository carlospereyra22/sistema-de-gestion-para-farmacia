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
});
