import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import {
  filterInventoryOptions,
  inventoryEnterOption,
  type InventoryOption,
} from "./lib/inventory-search";

export function InventorySearchSelect({
  label,
  value,
  options,
  onChange,
  inputRef,
}: {
  label: string;
  value: string;
  options: InventoryOption[];
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const matches = filterInventoryOptions(options, query);
  const results = matches.slice(0, 30);
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (rect)
        setAbove(window.innerHeight - rect.bottom < 280 && rect.top > 280);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, input]);
  useEffect(() => {
    input.current?.setCustomValidity(
      selected ? "" : "Seleccioná una opción de los resultados.",
    );
  }, [selected, input]);
  useEffect(() => {
    const item = list.current?.children[active] as HTMLElement | undefined;
    if (!item || !list.current) return;
    if (item.offsetTop < list.current.scrollTop)
      list.current.scrollTop = item.offsetTop;
    else if (
      item.offsetTop + item.offsetHeight >
      list.current.scrollTop + list.current.clientHeight
    )
      list.current.scrollTop =
        item.offsetTop + item.offsetHeight - list.current.clientHeight;
  }, [active, open, query]);
  function choose(option: InventoryOption) {
    setOpen(false);
    setQuery("");
    setActive(-1);
    onChange(option.value);
  }
  return (
    <div
      className="mt-4"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
          setActive(-1);
        }
      }}
    >
      <label htmlFor={id} className="block text-sm">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          ref={input}
          required={!selected}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-results`}
          aria-describedby={selected ? `${id}-detail` : undefined}
          aria-activedescendant={
            open && results[active] ? `${id}-${active}` : undefined
          }
          autoComplete="off"
          value={open ? query : (selected?.label ?? "")}
          placeholder="Nombre, laboratorio o código…"
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(-1);
          }}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setQuery("");
              setActive(-1);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
            if (value) onChange("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setQuery("");
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
              event.stopPropagation();
              if (open) {
                const option = inventoryEnterOption(matches, active);
                if (option) choose(option);
              }
            }
          }}
          className="h-10 w-full rounded-lg border bg-white pl-3 pr-8 text-sm"
        />
        <ChevronDown
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        {open && (
          <div
            className={`absolute inset-x-0 z-30 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg ${above ? "bottom-full mb-1" : "top-full mt-1"}`}
          >
            <ul
              ref={list}
              id={`${id}-results`}
              role="listbox"
              aria-label={label}
              style={{ scrollbarWidth: "thin" }}
              className="relative max-h-56 overflow-y-auto overscroll-contain"
            >
              {results.map((option, index) => (
                <li
                  id={`${id}-${index}`}
                  key={option.value}
                  role="option"
                  aria-selected={active === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  className={`cursor-pointer rounded-lg px-3 py-2 text-sm hover:bg-teal-50 ${active === index ? "bg-teal-50" : ""}`}
                >
                  <span className="block break-words font-medium text-slate-800">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block break-words text-xs leading-4 text-slate-500">
                    {option.detail}
                  </span>
                </li>
              ))}
            </ul>
            {!results.length && (
              <p role="status" className="px-3 py-3 text-sm text-slate-500">
                Sin coincidencias.
              </p>
            )}
            {matches.length > 30 && (
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                Mostrando 30 de {matches.length}. Escribí para precisar.
              </p>
            )}
          </div>
        )}
      </div>
      {selected && (
        <p
          id={`${id}-detail`}
          className="mt-1 break-words text-xs leading-4 text-slate-500"
        >
          {selected.detail}
        </p>
      )}
    </div>
  );
}
