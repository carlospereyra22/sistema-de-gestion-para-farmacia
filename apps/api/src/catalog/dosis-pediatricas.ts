// Dosis infantil por kilo para jarabes, gotas y suspensiones (SISTEMA-108).
// Tomada de la ficha técnica oficial de la presentación pediátrica (CIMA,
// AEMPS, sección 4.2; amoxicilina: ficha europea armonizada; cefalexina:
// prospecto del laboratorio original). La web calcula los ml con el peso y la
// concentración de la presentación. Ver docs/PRODUCTS.md.

export type DosisPediatrica = {
  /** mg por kilo en cada toma; si no, se reparte `mgKgDia` en las tomas. */
  mgKgToma?: [number, number];
  mgKgDia?: [number, number];
  tomasPorDia: number;
  /** Cada cuánto, como se le dice al cliente: "6-8 h". */
  cadaHoras: string;
  /** Topes: por toma, por día y por kilo por día. */
  maxMgToma?: number;
  maxMgDia?: number;
  maxMgKgDia?: number;
  /** Desde qué edad o peso se usa. */
  desde: string;
  nota?: string;
};

export const DOSIS_PEDIATRICAS: Record<string, DosisPediatrica> = {
  dipirona: {
    mgKgToma: [8, 16],
    tomasPorDia: 4,
    cadaHoras: "6-8",
    maxMgToma: 500,
    desde: "3 meses y 5 kg",
    nota: "Para la fiebre suele alcanzar 10 mg/kg por toma.",
  },
  paracetamol: {
    mgKgToma: [10, 15],
    tomasPorDia: 4,
    cadaHoras: "6",
    maxMgKgDia: 60,
    maxMgToma: 1000,
    desde: "el nacimiento (menores de 2 años, con indicación médica)",
    nota: "15 mg/kg cada 6 h, o 10 mg/kg cada 4 h si no alcanza.",
  },
  ibuprofeno: {
    mgKgDia: [20, 30],
    tomasPorDia: 3,
    cadaHoras: "8",
    maxMgKgDia: 30,
    maxMgToma: 400,
    desde: "3 meses y 5 kg",
    nota: "Nunca con menos de 4 h entre tomas.",
  },
  amoxicilina: {
    mgKgDia: [40, 90],
    tomasPorDia: 3,
    cadaHoras: "8",
    maxMgDia: 3000,
    desde: "el nacimiento, con indicación médica",
    nota: "La dosis del día según la infección; también se reparte en 2 tomas cada 12 h.",
  },
  cefalexina: {
    mgKgDia: [25, 50],
    tomasPorDia: 4,
    cadaHoras: "6",
    maxMgDia: 4000,
    desde: "el nacimiento, con indicación médica",
  },
  cefadroxilo: {
    mgKgDia: [30, 50],
    tomasPorDia: 2,
    cadaHoras: "12",
    maxMgDia: 2000,
    desde: "6 kg",
  },
  cefuroxima: {
    mgKgToma: [10, 15],
    tomasPorDia: 2,
    cadaHoras: "12",
    maxMgToma: 250,
    desde: "3 meses",
    nota: "10 mg/kg en faringitis y sinusitis; 15 mg/kg en otitis e infección urinaria.",
  },
  cefixima: {
    mgKgDia: [8, 8],
    tomasPorDia: 1,
    cadaHoras: "24",
    maxMgDia: 400,
    desde: "6 meses",
    nota: "También 4 mg/kg cada 12 h.",
  },
  azitromicina: {
    mgKgToma: [10, 10],
    tomasPorDia: 1,
    cadaHoras: "24",
    maxMgToma: 500,
    desde: "6 meses",
    nota: "Por 3 días (faringitis: 20 mg/kg por día, 3 días).",
  },
  claritromicina: {
    mgKgToma: [7.5, 7.5],
    tomasPorDia: 2,
    cadaHoras: "12",
    maxMgToma: 500,
    desde: "6 meses",
  },
  eritromicina: {
    mgKgDia: [30, 50],
    tomasPorDia: 4,
    cadaHoras: "6",
    maxMgDia: 4000,
    desde: "el nacimiento, con indicación médica",
  },
  metoclopramida: {
    mgKgToma: [0.1, 0.15],
    tomasPorDia: 3,
    cadaHoras: "8",
    maxMgKgDia: 0.5,
    maxMgToma: 10,
    desde: "1 año, con indicación médica",
    nota: "Máximo 5 días; nunca con menos de 6 h entre tomas.",
  },
  domperidona: {
    mgKgToma: [0.25, 0.25],
    tomasPorDia: 3,
    cadaHoras: "8",
    maxMgKgDia: 0.75,
    maxMgToma: 10,
    desde: "con indicación médica",
    nota: "Máximo 1 semana, antes de las comidas.",
  },
};
