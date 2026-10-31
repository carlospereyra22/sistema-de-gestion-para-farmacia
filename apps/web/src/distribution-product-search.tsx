import { useId, useState, type RefObject } from "react";
import { Search, Package } from "lucide-react";
import type { CatalogProduct } from "./lib/api";

export function DistributionProductSearch({
  products,
  query,
  onChange,
  onSelect,
  inputRef,
}: {
  products: CatalogProduct[];
  query: string;
  onChange: (value: string) => void;
  onSelect: (id: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = query.trim().toLocaleLowerCase();
  const matches = term
    ? products.filter(
        (p) =>
          p.active &&
          (p.name.toLocaleLowerCase().includes(term) ||
            p.barcodes.some((b) => b.code.includes(term))),
      )
    : [];
  const results = matches.slice(0, 20);
  const expanded = open && Boolean(term);
  function choose(product: CatalogProduct) {
    setOpen(false);
    setActive(-1);
    onSelect(product.id);
  }
  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="text-sm">
        Buscar o escanear producto
      </label>
      <div className="relative mt-1">
        <Search
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3.5 text-slate-400"
        />
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-results`}
          aria-activedescendant={
            expanded && active >= 0 ? `${id}-option-${active}` : undefined
          }
          autoComplete="off"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && expanded) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              const next = results.length
                ? event.key === "ArrowDown"
                  ? Math.min(active + 1, results.length - 1)
                  : Math.max(active - 1, 0)
                : -1;
              setActive(next);
              if (next >= 0)
                document
                  .getElementById(`${id}-option-${next}`)
                  ?.scrollIntoView({ block: "nearest" });
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const exact = products.filter(
                (p) =>
                  p.active && p.barcodes.some((b) => b.code === query.trim()),
              );
              const product =
                exact.length === 1
                  ? exact[0]
                  : expanded && active >= 0
                    ? results[active]
                    : matches.length === 1
                      ? matches[0]
                      : undefined;
              if (product) choose(product);
              else setOpen(true);
            }
          }}
          placeholder="Nombre o código de barras + Enter"
          className="h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm"
        />
      </div>
      {expanded && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">
            {matches.length
              ? "Elegí un producto · ↑ ↓ y Enter"
              : "No se encontraron productos"}
          </div>
          <div
            id={`${id}-results`}
            role="listbox"
            aria-label="Productos encontrados"
            className="max-h-52 overflow-y-auto overscroll-contain p-1"
          >
            {results.map((product, index) => (
              <button
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active === index}
                type="button"
                key={product.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(product)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-teal-50 ${active === index ? "bg-teal-50 text-teal-900" : "text-slate-700"}`}
              >
                <Package
                  size={17}
                  aria-hidden="true"
                  className="shrink-0 text-teal-600"
                />
                <span className="min-w-0 break-words font-medium">
                  {product.name}
                </span>
              </button>
            ))}
          </div>
          {matches.length > 20 && (
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              Mostrando 20 resultados. Escribí más para precisar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
