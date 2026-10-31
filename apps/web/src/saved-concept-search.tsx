import { useEffect, useId, useState } from "react";
import { filterConcepts } from "./lib/saved-sale-concepts";

export function SavedConceptSearch({
  items,
  onSelect,
}: {
  items: string[];
  onSelect: (value: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  const results = filterConcepts(items, query);
  const choose = (value: string) => {
    setQuery(value);
    setOpen(false);
    onSelect(value);
  };
  return (
    <div
      className="relative text-sm"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>Descripciones guardadas</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          open && results[active] ? `${id}-option-${active}` : undefined
        }
        autoComplete="off"
        placeholder="Buscar descripción…"
        value={query}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              Math.max(
                0,
                Math.min(
                  results.length - 1,
                  index + (event.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (results[active]) choose(results[active]);
          }
        }}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label="Descripciones guardadas"
          >
            {results.map((item, index) => (
              <li
                key={item}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                className={`cursor-pointer rounded-md px-3 py-2 hover:bg-teal-50 ${index === active ? "bg-teal-50 text-teal-800" : "text-slate-700"}`}
              >
                {item}
              </li>
            ))}
          </ul>
          {!results.length && (
            <p role="status" className="px-3 py-2 text-xs text-slate-500">
              Sin coincidencias. Podés escribir una descripción nueva abajo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
