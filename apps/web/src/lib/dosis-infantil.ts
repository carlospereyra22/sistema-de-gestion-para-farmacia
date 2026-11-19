import type { DosisPediatrica } from "./ficha-terapeutica";

export type ResultadoInfantil =
  | { tipo: "invalido" }
  | { tipo: "adulto" }
  | {
      tipo: "dosis";
      mg: [number, number];
      ml: [number, number] | null;
      maxMgDia: number | null;
      maxMlDia: number | null;
      cadaHoras: string;
      conTope: boolean;
    };

// Con 40 kg o más se usa la dosis de adultos (fichas oficiales).
export const PESO_ADULTO = 40;

const decimal = (valor: number) => Math.round(valor * 10) / 10;
// El máximo se redondea para abajo: nunca se pasa del tope.
const haciaAbajo = (valor: number) => Math.floor(valor * 10 + 1e-9) / 10;

// Dosis por toma para un peso: mg por kilo, con los topes por toma y por día
// de la ficha. Con la concentración, también en ml.
export function dosisInfantil(
  dosis: DosisPediatrica,
  pesoKg: number,
  mgPorMl: number | null,
): ResultadoInfantil {
  if (!Number.isFinite(pesoKg) || pesoKg < 2 || pesoKg > 150)
    return { tipo: "invalido" };
  if (pesoKg >= PESO_ADULTO) return { tipo: "adulto" };
  const rango = dosis.mgKgToma
    ? dosis.mgKgToma.map((mgKg) => mgKg * pesoKg)
    : (dosis.mgKgDia ?? [0, 0]).map(
        (mgKg) => (mgKg * pesoKg) / dosis.tomasPorDia,
      );
  const topes = [
    dosis.maxMgToma,
    dosis.maxMgDia === undefined
      ? undefined
      : dosis.maxMgDia / dosis.tomasPorDia,
    dosis.maxMgKgDia === undefined
      ? undefined
      : (dosis.maxMgKgDia * pesoKg) / dosis.tomasPorDia,
  ].filter((tope): tope is number => tope !== undefined);
  const tope = topes.length ? Math.min(...topes) : Infinity;
  const desde = Math.min(rango[0] ?? 0, tope);
  const hasta = Math.min(rango[1] ?? 0, tope);
  const maxDia = Math.min(
    hasta * dosis.tomasPorDia,
    dosis.maxMgDia ?? Infinity,
    dosis.maxMgKgDia === undefined ? Infinity : dosis.maxMgKgDia * pesoKg,
  );
  return {
    tipo: "dosis",
    mg: [decimal(desde), decimal(hasta)],
    ml: mgPorMl
      ? [decimal(desde / mgPorMl), haciaAbajo(hasta / mgPorMl)]
      : null,
    maxMgDia: Number.isFinite(maxDia) ? decimal(maxDia) : null,
    maxMlDia:
      mgPorMl && Number.isFinite(maxDia) ? haciaAbajo(maxDia / mgPorMl) : null,
    cadaHoras: dosis.cadaHoras,
    conTope: (rango[1] ?? 0) > tope,
  };
}
