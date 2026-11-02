import { useState } from "react";
import { Plus, X } from "lucide-react";
import { addEquivalentBarcode, removeEquivalentBarcode } from "./lib/api";
import { externalGtin } from "./lib/external-product";

// Códigos de envases importados del mismo medicamento (SISTEMA-20). En un
// producto guardado se guardan al instante. En uno nuevo (sin `productId`)
// quedan pendientes y se envían con el alta al apretar Guardar producto.
export function ProductEquivalentBarcodes({
  token,
  organizationId,
  productId,
  initialCodes,
  primaryCode = "",
  disabled,
  onChanged,
  onPendingChange,
  pendingCodes = [],
  onRemovePending,
}: {
  // Códigos que se asocian al guardar un producto ya guardado (envase
  // importado elegido desde el buscador).
  pendingCodes?: string[];
  onRemovePending?: () => void;
  token: string;
  organizationId: string;
  productId?: string;
  initialCodes: string[];
  primaryCode?: string;
  disabled: boolean;
  onChanged?: () => void;
  onPendingChange?: (codes: string[]) => void;
}) {
  const [codes, setCodes] = useState(initialCodes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const code = draft.trim();
  const valid = Boolean(externalGtin(code));
  const pending = !productId;
  const setPending = (next: string[]) => {
    setCodes(next);
    onPendingChange?.(next);
  };
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
      if (!pending) onChanged?.();
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
      const gtin = externalGtin(code);
      if (
        externalGtin(primaryCode.trim()) === gtin ||
        codes.some((item) => externalGtin(item) === gtin)
      )
        throw new Error(`El código ${code} ya es un código de este producto.`);
      if (!productId) {
        setPending([...codes, code]);
        setDraft("");
        return;
      }
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
      if (!productId) {
        setPending(codes.filter((item) => item !== value));
        return;
      }
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
        {pending && " Se guardan al guardar el producto."}
      </p>
      {(codes.length > 0 || pendingCodes.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {codes.map((item) => (
            <li
              key={item}
              className={`flex items-center gap-1.5 rounded-md border py-1 pl-2.5 pr-1 text-xs ${
                pending
                  ? "border-dashed border-teal-400 bg-white text-teal-900"
                  : "border-teal-200 bg-teal-50 text-teal-900"
              }`}
            >
              <span className="font-mono">{item}</span>
              {pending && (
                <span className="text-[10px] font-semibold text-teal-700">
                  pendiente
                </span>
              )}
              <button
                type="button"
                onClick={() => void remove(item)}
                disabled={disabled || busy}
                aria-label={`Quitar código equivalente ${item}`}
                className="grid size-5 place-items-center rounded text-teal-700 hover:bg-teal-100"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
          {/* Envase importado que se asocia al apretar Guardar. */}
          {pendingCodes.map((item) => (
            <li
              key={`pendiente-${item}`}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-teal-400 bg-white py-1 pl-2.5 pr-1 text-xs text-teal-900"
            >
              <span className="font-mono">{item}</span>
              <span className="text-[10px] font-semibold text-teal-700">
                pendiente
              </span>
              <button
                type="button"
                onClick={onRemovePending}
                disabled={disabled}
                aria-label={`No asociar el código ${item}`}
                className="grid size-5 place-items-center rounded text-teal-700 hover:bg-teal-100"
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
          className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 !text-sm placeholder:text-slate-400"
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
