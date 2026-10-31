import { useId, useRef, useState } from "react";
import { CalendarClock, Infinity as InfinityIcon } from "lucide-react";

export function AccountPaymentTerm({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [editingDays, setEditingDays] = useState(value !== "");
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const withTerm = value !== "" || editingDays;
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">Plazo de pago</legend>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          Plazo de pago
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
          {[
            {
              selected: !withTerm,
              label: "Sin vencimiento",
              icon: InfinityIcon,
            },
            { selected: withTerm, label: "A plazo", icon: CalendarClock },
          ].map(({ selected, label, icon: Icon }, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setEditingDays(index === 1);
                if (index === 0) onChange("");
                else requestAnimationFrame(() => input.current?.focus());
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 ${selected ? "bg-white font-semibold text-teal-700 shadow-sm ring-1 ring-slate-200/70" : "text-slate-500 hover:text-teal-700"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        {withTerm && (
          <label
            className="flex h-10 w-32 items-center overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100"
            htmlFor={id}
          >
            <span className="sr-only">Cantidad de días del plazo de pago</span>
            <input
              ref={input}
              id={id}
              required
              type="number"
              min="0"
              max="3650"
              step="1"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Días"
              className="h-full min-w-0 flex-1 bg-transparent pl-3 pr-1 text-sm outline-none"
            />
            <span className="pr-3 text-xs text-slate-500">días</span>
          </label>
        )}
      </div>
    </fieldset>
  );
}
