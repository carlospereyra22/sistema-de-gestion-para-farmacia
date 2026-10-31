import { useId, useState } from "react";
import { UserRound, Plus, X } from "lucide-react";
import type { SaleFiscalOptions } from "@gestion/contracts";

export function ConsumerFiscalFields({
  value,
  onChange,
}: {
  value: SaleFiscalOptions;
  onChange: (value: SaleFiscalOptions) => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(
    Boolean(value.consumerName || value.consumerDocument),
  );
  return (
    <section
      className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
      aria-label="Datos del consumidor final"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-white p-2 text-teal-700">
          <UserRound size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-800">
            {expanded
              ? "Datos del comprador"
              : "Consumidor final sin identificar"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {expanded
              ? "Completá sólo los datos que correspondan a esta venta."
              : "No necesitás completar DNI o CUIT para guardar esta opción. Si la operación requiere identificación, el sistema te lo indicará."}
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${id}-fields`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-teal-800 transition hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600"
        onClick={() => {
          if (expanded)
            onChange({
              ...value,
              consumerName: undefined,
              consumerDocument: undefined,
            });
          setExpanded(!expanded);
        }}
      >
        {expanded ? (
          <X size={14} aria-hidden="true" />
        ) : (
          <Plus size={14} aria-hidden="true" />
        )}
        {expanded
          ? "Quitar datos y dejar sin identificar"
          : "Agregar datos del comprador"}
      </button>
      <div id={`${id}-fields`}>
        {expanded && (
          <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <label className="block text-sm" htmlFor={`${id}-name`}>
              Nombre o razón social{" "}
              <span className="text-xs text-slate-500">(opcional)</span>
            </label>
            <input
              id={`${id}-name`}
              maxLength={160}
              value={value.consumerName || ""}
              onChange={(event) =>
                onChange({ ...value, consumerName: event.target.value })
              }
              placeholder="Nombre del comprador"
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
            />
            <label className="block text-sm" htmlFor={`${id}-document`}>
              DNI o CUIT{" "}
              <span className="text-xs text-slate-500">
                (opcional, salvo identificación requerida)
              </span>
            </label>
            <input
              id={`${id}-document`}
              inputMode="numeric"
              pattern="(?:[0-9]{7,8}|[0-9]{11})?"
              maxLength={11}
              value={value.consumerDocument || ""}
              onChange={(event) =>
                onChange({ ...value, consumerDocument: event.target.value })
              }
              aria-describedby={`${id}-hint`}
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
            />
            <p id={`${id}-hint`} className="text-xs text-slate-500">
              Sin puntos ni guiones. No es necesario que sea CUIT: también podés
              ingresar DNI.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
