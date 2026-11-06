import type { ReactElement } from "react";
import { cashMoney } from "./lib/cash-session-view";
import type { AdjustmentCostMode } from "./lib/stock-adjustment";
import { MoneyInput } from "./money-input";

const modes: [AdjustmentCostMode, string][] = [
  ["none", "Sin costo"],
  ["last", "Último costo"],
  ["other", "Otro costo"],
];

// Las unidades sumadas pueden entrar sin costo, al último del lote o a uno nuevo.
export function StockAdjustmentCost({
  lastCostMinor,
  mode,
  onModeChange,
  value,
  onChange,
}: {
  // Sin lote elegido no hay dato. "0" es un lote sin costo conocido.
  lastCostMinor?: string;
  mode: AdjustmentCostMode;
  onModeChange: (mode: AdjustmentCostMode) => void;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const hasLastCost = Boolean(lastCostMinor && BigInt(lastCostMinor) > 0n);
  return (
    <fieldset className="mt-4">
      <legend className="text-sm">Costo de estas unidades</legend>
      <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
        {modes.map(([option, label]) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            disabled={option === "last" && !hasLastCost}
            onClick={() => onModeChange(option)}
            className={`h-10 rounded-lg border font-medium disabled:cursor-not-allowed disabled:opacity-50 ${mode === option ? "border-teal-300 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {lastCostMinor !== undefined ? (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {hasLastCost ? (
            <>
              Último costo asociado:{" "}
              <strong className="font-semibold text-slate-800">
                {cashMoney(lastCostMinor!)}
              </strong>
            </>
          ) : (
            "Este lote no tiene un costo asociado."
          )}
        </p>
      ) : null}
      {mode === "other" ? (
        <MoneyInput
          label="Costo unitario"
          value={value}
          onChange={onChange}
          labelClassName="mt-3 block text-sm"
        />
      ) : null}
    </fieldset>
  );
}
