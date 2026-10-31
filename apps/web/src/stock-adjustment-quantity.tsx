import type { RefObject } from "react";
import { Minus, Plus } from "lucide-react";

export function StockAdjustmentQuantity({
  direction,
  onDirectionChange,
  value,
  onChange,
  inputRef,
}: {
  direction: "subtract" | "add";
  onDirectionChange: (direction: "subtract" | "add") => void;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm">Ajustar cantidad</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={direction === "subtract"}
          onClick={() => onDirectionChange("subtract")}
          className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium ${direction === "subtract" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
        >
          <Minus size={17} aria-hidden="true" />
          Restar
        </button>
        <button
          type="button"
          aria-pressed={direction === "add"}
          onClick={() => onDirectionChange("add")}
          className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium ${direction === "add" ? "border-teal-300 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
        >
          <Plus size={17} aria-hidden="true" />
          Sumar
        </button>
      </div>
      <label className="mt-3 block text-sm">
        {direction === "subtract" ? "Unidades a restar" : "Unidades a sumar"}
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          required
          min={0}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ej. 4"
          className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
        />
      </label>
    </fieldset>
  );
}
