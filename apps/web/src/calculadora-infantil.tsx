import { Baby } from "lucide-react";
import { useState } from "react";
import { dosisInfantil, PESO_ADULTO } from "./lib/dosis-infantil";
import type { DosisPediatrica } from "./lib/ficha-terapeutica";

const numero = (valor: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(valor);
const rango = ([desde, hasta]: [number, number], unidad: string) =>
  desde === hasta
    ? `${numero(desde)} ${unidad}`
    : `${numero(desde)}-${numero(hasta)} ${unidad}`;

// Jarabes, gotas y suspensiones (SISTEMA-108): con el peso del chico, cuánto
// por toma según la ficha oficial y la concentración de la presentación.
export function CalculadoraInfantil({
  dosis,
  mgPorMl,
  pesoInicial = "",
}: {
  dosis: DosisPediatrica;
  mgPorMl: number | null;
  pesoInicial?: string;
}) {
  const [peso, setPeso] = useState(pesoInicial);
  const kilos = Number(peso.replace(",", "."));
  const resultado = peso.trim() ? dosisInfantil(dosis, kilos, mgPorMl) : null;
  const porKilo = dosis.mgKgToma
    ? `${rango(dosis.mgKgToma, "mg/kg")} por toma`
    : `${rango(dosis.mgKgDia ?? [0, 0], "mg/kg")} por día en ${dosis.tomasPorDia} tomas`;
  return (
    <div
      aria-label="Dosis para chicos"
      className="mt-2 rounded-lg border border-sky-100 bg-sky-50/60 p-3"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-800">
        <Baby size={14} aria-hidden /> Chicos: {porKilo}, cada {dosis.cadaHoras}{" "}
        h · desde {dosis.desde}
      </p>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        Peso
        <input
          aria-label="Peso del chico en kg"
          inputMode="decimal"
          value={peso}
          onChange={(event) => setPeso(event.target.value)}
          placeholder="15"
          className="h-8 w-20 rounded-md border border-slate-300 bg-white px-2 text-right text-sm tabular-nums"
        />
        kg
      </label>
      {resultado?.tipo === "invalido" && (
        <p className="mt-1.5 text-xs text-red-700">Revisá el peso.</p>
      )}
      {resultado?.tipo === "adulto" && (
        <p className="mt-1.5 text-sm text-slate-700">
          Con {PESO_ADULTO} kg o más se usa la dosis de adultos.
        </p>
      )}
      {resultado?.tipo === "dosis" && (
        <div className="mt-1.5 text-sm">
          <p className="font-semibold text-sky-900">
            {resultado.ml
              ? `${rango(resultado.ml, "ml")} cada ${resultado.cadaHoras} h`
              : `${rango(resultado.mg, "mg")} cada ${resultado.cadaHoras} h`}
            {resultado.ml && (
              <span className="font-normal text-slate-600">
                {" "}
                ({rango(resultado.mg, "mg")})
              </span>
            )}
          </p>
          {resultado.maxMgDia !== null && (
            <p className="text-xs text-slate-600">
              Máximo por día:{" "}
              {resultado.maxMlDia !== null
                ? `${numero(resultado.maxMlDia)} ml (${numero(resultado.maxMgDia)} mg)`
                : `${numero(resultado.maxMgDia)} mg`}
              {resultado.conTope && " · llega al tope de la ficha"}
            </p>
          )}
          {!resultado.ml && (
            <p className="text-xs text-amber-700">
              Para pasarlo a ml, cargá la concentración del producto (ej. 50
              mg/ml).
            </p>
          )}
        </div>
      )}
      {dosis.nota && (
        <p className="mt-1.5 text-xs text-slate-600">{dosis.nota}</p>
      )}
    </div>
  );
}
