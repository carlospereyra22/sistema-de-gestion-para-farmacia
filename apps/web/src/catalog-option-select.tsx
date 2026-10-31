import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import {
  cleanCatalogOptionName,
  filterCatalogOptions,
  matchingCatalogOption,
  type CatalogOption,
} from "./lib/catalog-option";

export function CatalogOptionSelect({
  label,
  emptyLabel,
  value,
  options,
  disabled = false,
  onChange,
  onCreate,
  allowParent = false,
}: {
  label: string;
  emptyLabel: string;
  value: string;
  options: CatalogOption[];
  disabled?: boolean;
  onChange: (id: string) => void;
  onCreate: (name: string, parentId?: string | null) => Promise<CatalogOption>;
  allowParent?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const lock = useRef(false);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const [parentId, setParentId] = useState(value);
  const selected = options.find((option) => option.id === value);
  const clean = cleanCatalogOptionName(query);
  const matches = filterCatalogOptions(options, query);
  const results = clean
    ? matches.slice(0, 20)
    : [{ id: "", name: emptyLabel }, ...matches.slice(0, 20)];
  const canCreate =
    clean.length >= 2 &&
    clean.length <= 120 &&
    !matchingCatalogOption(
      allowParent
        ? options.filter((option) => (option.parentId ?? "") === parentId)
        : options,
      clean,
    );
  const blocked = disabled || busy;
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      let parent = input.current?.parentElement;
      while (
        parent &&
        !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)
      )
        parent = parent.parentElement;
      const boundary = parent?.getBoundingClientRect();
      const below =
        Math.min(window.innerHeight, boundary?.bottom ?? window.innerHeight) -
        rect.bottom;
      const spaceAbove = rect.top - Math.max(0, boundary?.top ?? 0);
      setAbove(below < 240 && spaceAbove > below);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    input.current?.setCustomValidity(
      dirty
        ? "Seleccioná una opción o usá Crear para guardar el nombre nuevo."
        : "",
    );
  }, [dirty]);
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
  }, [active, open]);
  const choose = (option: CatalogOption) => {
    onChange(option.id);
    setDirty(false);
    input.current?.setCustomValidity("");
    setQuery("");
    setOpen(false);
    setError("");
    setActive(-1);
  };
  const create = async () => {
    if (lock.current || disabled || !canCreate) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      choose(await onCreate(clean, allowParent ? parentId || null : undefined));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la opción. Intentá nuevamente.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div
      className="relative mt-3 min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-600"
      >
        {label}
      </label>
      <div className="relative mt-1">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && results[active] ? `${id}-${active}` : undefined
          }
          aria-describedby={error ? `${id}-error` : undefined}
          aria-busy={busy}
          autoComplete="off"
          maxLength={120}
          disabled={disabled && !busy}
          readOnly={busy}
          value={
            open || dirty ? query : (selected?.path ?? selected?.name ?? "")
          }
          placeholder={open ? "Buscar o escribir…" : emptyLabel}
          onFocus={() => {
            if (!blocked) {
              if (!dirty) setParentId(value);
              setOpen(true);
              setActive(-1);
            }
          }}
          onClick={() => {
            if (!blocked) setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            if (
              event.nativeEvent instanceof CustomEvent &&
              event.nativeEvent.detail === "product-scanner-restore"
            ) {
              setDirty(
                Boolean(event.target.value.trim()) &&
                  event.target.value !== (selected?.path ?? selected?.name),
              );
              setOpen(false);
              return;
            }
            setDirty(true);
            setOpen(true);
            setActive(-1);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              if (blocked) return;
              if (!open) {
                setOpen(true);
                return;
              }
              const option =
                active >= 0
                  ? results[active]
                  : (matchingCatalogOption(options, query) ??
                    (clean && results.length === 1 ? results[0] : undefined));
              if (option) choose(option);
              // Creating is always explicit via the + button, never accidental form submission.
            }
            if (event.key === "Escape" && (open || dirty)) {
              event.preventDefault();
              event.stopPropagation();
              if (busy) return;
              setOpen(false);
              setDirty(false);
              setQuery("");
              setError("");
            }
            if (
              (event.key === "ArrowDown" || event.key === "ArrowUp") &&
              !blocked
            ) {
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
          }}
          className="h-10 w-full rounded-md border border-slate-300 bg-white pl-3 pr-8 text-sm font-normal text-slate-700 disabled:opacity-60"
        />
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
      {open && (
        <div
          className={`absolute inset-x-0 z-30 rounded-xl border border-slate-200 bg-white p-1 shadow-lg ${above ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          <ul
            ref={list}
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            className="relative max-h-40 overflow-y-auto overscroll-contain"
            style={{ scrollbarWidth: "thin" }}
          >
            {results.map((option, index) => (
              <li
                key={option.id}
                id={`${id}-${index}`}
                role="option"
                aria-selected={value === option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!blocked) choose(option);
                }}
                className={`cursor-pointer break-words rounded-lg px-3 py-2 text-sm hover:bg-teal-50 ${active === index ? "bg-teal-50 text-teal-800" : "text-slate-700"}`}
              >
                {option.path ?? option.name}
              </li>
            ))}
          </ul>
          {!results.length && (
            <p className="px-3 py-2 text-xs text-slate-500">
              Sin coincidencias.
            </p>
          )}
          {matches.length > 20 && (
            <p className="px-3 py-2 text-xs text-slate-500">
              Escribí para precisar la búsqueda.
            </p>
          )}
          {allowParent && clean.length >= 2 && (
            <label className="block border-t border-slate-100 px-3 pt-3 text-xs font-medium text-slate-500">
              Crear dentro de
              <select
                aria-label="Categoría superior"
                value={parentId}
                disabled={blocked}
                onChange={(event) => setParentId(event.target.value)}
                className="my-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
              >
                <option value="">Categoría principal</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.path ?? option.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canCreate && (
            <button
              type="button"
              disabled={blocked}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void create()}
              className="mt-1 flex w-full items-start gap-2 rounded-lg bg-teal-50 px-3 py-2 text-left text-sm font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
            >
              <Plus size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {busy ? "Creando…" : `Crear “${clean}”`}
              </span>
            </button>
          )}
        </div>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-xs text-rose-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
