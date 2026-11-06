import type { ReactElement, RefObject } from "react";
import { ScanBarcode } from "lucide-react";

// Piezas comunes de Recibir, Ajustar y Devolver: las tres pestañas tienen que
// verse y comportarse igual.
export function InventoryScanField({
  value,
  status,
  error,
  inputRef,
  onChange,
  onSubmit,
}: {
  value: string;
  status: string;
  error: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
}): ReactElement {
  return (
    <div className="relative">
      <label className="block text-sm">
        Escanear código o QR
        <span className="inventory-scan-field mt-1 flex h-10 items-center gap-2 rounded-lg border border-teal-600 bg-teal-50/40 px-3">
          <ScanBarcode size={19} className="shrink-0 text-teal-700" />
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Escaneá el código"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </span>
      </label>
      {/* Flota en el espacio entre campos: aparecer no mueve el formulario. */}
      {status ? (
        <p
          title={status}
          className={`absolute inset-x-0 top-full mt-0.5 truncate text-xs leading-4 ${error ? "text-rose-600" : "text-teal-700"}`}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

export function InventoryFormActions({
  submitLabel,
  canClear,
  onClear,
}: {
  submitLabel: string;
  canClear: boolean;
  onClear: () => void;
}): ReactElement {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
      <button
        type="button"
        disabled={!canClear}
        onClick={onClear}
        className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:border-teal-300 hover:bg-teal-50 disabled:cursor-default disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:bg-white"
      >
        Limpiar
      </button>
      <button
        type="submit"
        className="h-10 rounded-lg bg-teal-700 px-3 text-sm font-medium text-white hover:bg-teal-800"
      >
        {submitLabel}
      </button>
    </div>
  );
}
