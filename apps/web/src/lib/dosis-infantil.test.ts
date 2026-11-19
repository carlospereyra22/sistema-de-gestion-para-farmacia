import { describe, expect, it } from "vitest";
import { dosisInfantil } from "./dosis-infantil";
import type { DosisPediatrica } from "./ficha-terapeutica";

const dipirona: DosisPediatrica = {
  mgKgToma: [8, 16],
  tomasPorDia: 4,
  cadaHoras: "6-8",
  maxMgToma: 500,
  desde: "3 meses y 5 kg",
};
const ibuprofeno: DosisPediatrica = {
  mgKgDia: [20, 30],
  tomasPorDia: 3,
  cadaHoras: "8",
  maxMgKgDia: 30,
  maxMgToma: 400,
  desde: "3 meses y 5 kg",
};
const paracetamol: DosisPediatrica = {
  mgKgToma: [10, 15],
  tomasPorDia: 4,
  cadaHoras: "6",
  maxMgKgDia: 60,
  maxMgToma: 1000,
  desde: "",
};

describe("dosis infantil por peso", () => {
  it("Novalgina jarabe 50 mg/ml para 15 kg", () => {
    expect(dosisInfantil(dipirona, 15, 50)).toEqual({
      tipo: "dosis",
      mg: [120, 240],
      ml: [2.4, 4.8],
      maxMgDia: 960,
      maxMlDia: 19.2,
      cadaHoras: "6-8",
      conTope: false,
    });
  });

  it("respeta el tope por toma", () => {
    // 35 kg × 16 = 560 mg: el tope de la ficha es 500 mg por toma.
    const resultado = dosisInfantil(dipirona, 35, 50);
    expect(resultado).toMatchObject({ mg: [280, 500], conTope: true });
  });

  it("reparte la dosis del día en las tomas (ibuprofeno 20 mg/ml)", () => {
    // 10 kg: 200-300 mg por día en 3 tomas → 66,7-100 mg = 3,3-5 ml.
    expect(dosisInfantil(ibuprofeno, 10, 20)).toMatchObject({
      mg: [66.7, 100],
      ml: [3.3, 5],
      maxMgDia: 300,
      maxMlDia: 15,
    });
  });

  it("coincide con la tabla oficial del paracetamol 100 mg/ml", () => {
    // Ficha: hasta 13 kg, 2 ml (200 mg) cada 6 h a 15 mg/kg.
    expect(dosisInfantil(paracetamol, 13, 100)).toMatchObject({
      mg: [130, 195],
      ml: [1.3, 1.9],
      maxMgDia: 780,
    });
  });

  it("sin concentración da los mg; con 40 kg o más, dosis de adultos", () => {
    expect(dosisInfantil(dipirona, 15, null)).toMatchObject({ ml: null });
    expect(dosisInfantil(dipirona, 45, 50)).toEqual({ tipo: "adulto" });
    expect(dosisInfantil(dipirona, 0, 50)).toEqual({ tipo: "invalido" });
    expect(dosisInfantil(dipirona, Number.NaN, 50)).toEqual({
      tipo: "invalido",
    });
  });
});
