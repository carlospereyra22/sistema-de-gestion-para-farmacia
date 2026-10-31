import { useEffect, useId, useRef, useState } from "react";
import { SlidersHorizontal, X, Link, Image, ScanBarcode } from "lucide-react";
import {
  emptyCatalogAdditionalFilters,
  type CatalogAdditionalFilters,
} from "./lib/catalog-additional-filters";
import { primary, secondary } from "./supplier-payables/dialog";

export function ProductAdditionalFilters({
  value,
  onApply,
  onClose,
}: {
  value: CatalogAdditionalFilters;
  onApply: (filters: CatalogAdditionalFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const el = ref.current,
      previous = document.activeElement;
    el?.showModal();
    return () => {
      el?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  const sections = [
    {
      key: "reference",
      label: "Precios de referencia",
      icon: Link,
      options: [
        ["", "Todos"],
        ["linked", "Vinculados"],
        ["unlinked", "Sin vincular"],
      ],
    },
    {
      key: "image",
      label: "Foto del producto",
      icon: Image,
      options: [
        ["", "Todos"],
        ["with", "Con foto"],
        ["without", "Sin foto"],
      ],
    },
    {
      key: "barcode",
      label: "Código de barras",
      icon: ScanBarcode,
      options: [
        ["", "Todos"],
        ["with", "Con código"],
        ["without", "Sin código"],
      ],
    },
  ] as const;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/30"
    >
      <form
        className="flex max-h-[90dvh] flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(draft);
        }}
      >
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <SlidersHorizontal size={20} className="text-teal-700" />
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              Filtros adicionales
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Combiná estas opciones con los filtros del listado.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar filtros"
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </header>
        <div className="space-y-6 overflow-y-auto p-5">
          <label className="block text-xs font-medium text-slate-600">
            Tipo de producto
            <select
              aria-label="Filtrar por tipo de producto"
              value={draft.kind ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value })
              }
              className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="medicine">Medicamentos</option>
              <option value="other">Otros productos</option>
            </select>
          </label>
          {sections.map(({ key, label, icon: Icon, options }) => (
            <fieldset key={key}>
              <legend className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-600">
                <Icon size={15} />
                {label}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {options.map(([option, text]) => (
                  <label
                    key={option}
                    className={`relative cursor-pointer rounded-lg border px-2 py-2.5 text-center text-xs transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${draft[key] === option ? "border-teal-300 bg-teal-50 font-medium text-teal-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name={key}
                      value={option}
                      checked={draft[key] === option}
                      onChange={() => setDraft({ ...draft, [key]: option })}
                    />
                    {text}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            className="mr-auto text-xs text-slate-500 underline-offset-4 hover:underline"
            onClick={() => setDraft(emptyCatalogAdditionalFilters)}
          >
            Limpiar adicionales
          </button>
          <button type="button" className={secondary} onClick={onClose}>
            Cancelar
          </button>
          <button className={primary}>Aplicar filtros</button>
        </footer>
      </form>
    </dialog>
  );
}
