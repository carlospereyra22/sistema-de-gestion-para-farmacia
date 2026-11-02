import { useState } from "react";
import { Plus, X } from "lucide-react";
import { addEquivalentBarcode, removeEquivalentBarcode } from "./lib/api";
import { externalGtin } from "./lib/external-product";

// Códigos de envases importados del mismo medicamento (SISTEMA-20). Se
// guardan al instante: no dependen del botón Guardar producto.
export function ProductEquivalentBarcodes({
  token,
  organizationId,
  productId,
  initialCodes,
  disabled,
  onChanged,
}: {
  token: string;
  organizationId: string;
  productId: string;
  initialCodes: string[];
  disabled: boolean;
  onChanged: () => void;
}) {
  const [codes, setCodes] = useState(initialCodes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const code = draft.trim();
  const valid = Boolean(externalGtin(code));
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar el código equivalente.",
      );
    } finally {
      setBusy(false);
    }
  };
  const add = () =>
    run(async () => {
      if (!valid) throw new Error("Ingresá un código de barras válido.");
      const saved = await addEquivalentBarcode(
        token,
        organizationId,
        productId,
        code,
      );
      setCodes((current) => [...current, saved.code]);
      setDraft("");
    });
  const remove = (value: string) =>
    run(async () => {
      await removeEquivalentBarcode(token, organizationId, productId, value);
      setCodes((current) => current.filter((item) => item !== value));
    });
  return (
    <div className="sm:col-span-2 mt-3">
      <p className="text-xs font-semibold text-slate-600">
        Códigos equivalentes (envases importados)
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Al escanear cualquiera de estos códigos se vende este mismo producto.
      </p>
      {codes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {codes.map((item) => (
            <li
              key={item}
              className="flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 py-1 pl-2.5 pr-1 text-xs text-sky-900"
            >
              <span className="font-mono">{item}</span>
              <button
                type="button"
                onClick={() => void remove(item)}
                disabled={disabled || busy}
                aria-label={`Quitar código equivalente ${item}`}
                className="grid size-5 place-items-center rounded text-sky-700 hover:bg-sky-100"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add();
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          aria-label="Código equivalente a asociar"
          placeholder="Escaneá el código del envase importado"
          disabled={disabled || busy}
          className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={disabled || busy || !valid}
          className="flex h-9 items-center gap-1.5 rounded-md border border-teal-600 bg-white px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50"
        >
          <Plus size={15} aria-hidden="true" />
          Asociar
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
