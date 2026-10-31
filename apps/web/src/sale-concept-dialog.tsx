import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { parseConceptAmount } from "./lib/concept-amount";
import { SavedConceptSearch } from "./saved-concept-search";
import {
  conceptDescription,
  conceptStorageKey,
  readConceptDescriptions,
  saveConceptDescription,
} from "./lib/saved-sale-concepts";

export function SaleConceptDialog({
  onClose,
  onAdd,
  organizationId,
  userKey,
}: {
  organizationId: string;
  userKey: string;
  onClose: () => void;
  onAdd: (concept: { description: string; unitPriceMinor: number }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const priceInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const storageKey = conceptStorageKey(organizationId, userKey);
  useEffect(() => {
    try {
      setSaved(readConceptDescriptions(window.localStorage, storageKey));
    } catch {
      setSaved([]);
      setSaveMessage(
        "No se pudieron leer los guardados. Podés cargar el concepto manualmente.",
      );
    }
  }, [storageKey]);
  const unitPriceMinor = parseConceptAmount(amount);
  const valid =
    conceptDescription(description) !== undefined &&
    unitPriceMinor !== undefined;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="sale-concept-title"
      style={{ width: "min(440px, calc(100vw - 32px))" }}
      className="m-auto max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl backdrop:bg-slate-950/35"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="sale-concept-title" className="text-lg font-semibold">
          Agregar concepto
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar concepto"
          className="rounded-lg p-2 hover:bg-slate-100"
        >
          <X size={18} />
        </button>
      </header>
      <p className="mt-2 text-sm text-slate-500">
        Para un cobro puntual fuera del catálogo. Aparecerá en el comprobante y
        no descontará stock.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && unitPriceMinor !== undefined)
            onAdd({ description: description.trim(), unitPriceMinor });
        }}
        className="mt-5 space-y-4"
      >
        {saved.length > 0 && (
          <SavedConceptSearch
            items={saved}
            onSelect={(value) => {
              setDescription(value);
              setSaveMessage("");
              priceInput.current?.focus();
              priceInput.current?.select();
            }}
          />
        )}
        <div className="text-sm">
          <label htmlFor="concept-description">Descripción</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="concept-description"
              autoFocus
              required
              minLength={3}
              maxLength={160}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setSaveMessage("");
              }}
              placeholder="Ej. Artículo fuera de catálogo"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2"
            />
            <button
              type="button"
              aria-label="Guardar descripción"
              title="Guardar descripción para próximas ventas en este navegador"
              disabled={!conceptDescription(description)}
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-50 disabled:opacity-40"
              onClick={() => {
                try {
                  setSaved(
                    saveConceptDescription(
                      window.localStorage,
                      storageKey,
                      description,
                    ),
                  );
                  setDescription(description.trim());
                  setSaveMessage("Descripción guardada en este navegador.");
                  priceInput.current?.focus();
                } catch {
                  setSaveMessage(
                    "No se pudo guardar. Podés continuar la venta sin guardarla.",
                  );
                }
              }}
            >
              <Plus size={18} />
            </button>
          </div>
          {saveMessage && (
            <p role="status" className="mt-1 text-xs text-slate-500">
              {saveMessage}
            </p>
          )}
        </div>
        <label className="block text-sm">
          Precio por unidad ($)
          <input
            ref={priceInput}
            required
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Ej. 1500,00 (sin separador de miles)"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <p className="text-xs text-slate-500">
          Podés cambiar la cantidad en la venta.
        </p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Agregar a la venta
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
