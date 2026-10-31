import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { filterSearchOptions, type SearchOption } from "./lib/search-options";

export function SearchableSaleSelect({
  label,
  value,
  options,
  onChange,
  tinted = false,
  disabled = false,
  inlineOptions = false,
  floatingOptions = false,
  compact = false,
  placeholder,
}: {
  label: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  tinted?: boolean;
  disabled?: boolean;
  inlineOptions?: boolean;
  floatingOptions?: boolean;
  compact?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties>({});
  const [listHeight, setListHeight] = useState(208);
  useLayoutEffect(() => {
    if (!open || !floatingOptions) return;
    const position = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.top - 12;
      const below = window.innerHeight - rect.bottom - 12;
      const upwards = above > below;
      setListHeight(
        Math.max(32, Math.min(208, (upwards ? above : below) - 12)),
      );
      setFloatingStyle({
        position: "fixed",
        width: Math.min(rect.width, window.innerWidth - 16),
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - rect.width - 8),
        ),
        ...(upwards
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
        zIndex: 50,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, floatingOptions]);
  const results = filterSearchOptions(options, query);
  const selected =
    options.find((option) => option.value === value)?.label ?? "";
  const choose = (option: SearchOption) => {
    setOpen(false);
    setQuery("");
    onChange(option.value);
  };
  useEffect(() => {
    const option = list.current?.children[active] as HTMLElement | undefined;
    if (!option || !list.current) return;
    if (option.offsetTop < list.current.scrollTop)
      list.current.scrollTop = option.offsetTop;
    else if (
      option.offsetTop + option.offsetHeight >
      list.current.scrollTop + list.current.clientHeight
    )
      list.current.scrollTop =
        option.offsetTop + option.offsetHeight - list.current.clientHeight;
  }, [active, open, query]);
  return (
    <div
      className="relative mt-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        disabled={disabled}
        ref={input}
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={
          open && results[active] ? `${id}-${active}` : undefined
        }
        autoComplete="off"
        value={open ? query : selected}
        placeholder={
          placeholder ?? `Buscar ${label.toLocaleLowerCase("es-AR")}…`
        }
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onClick={() => {
          if (!open) {
            setQuery("");
            setActive(0);
            setOpen(true);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
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
              !open
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      results.length - 1,
                      index + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
            );
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            event.stopPropagation();
            if (results[active]) choose(results[active]);
          }
        }}
        className={`${compact ? "h-8 text-xs" : "h-10 text-sm"} w-full rounded-lg border pl-3 pr-8 disabled:opacity-50 ${tinted ? "border-teal-200 bg-teal-50 text-teal-800" : "bg-white text-slate-700"}`}
      />
      <ChevronDown
        size={14}
        aria-hidden
        className={`pointer-events-none absolute right-3 text-slate-500 ${compact ? "top-2" : "top-3"}`}
      />
      {open && !disabled && (
        <div
          style={floatingOptions ? floatingStyle : undefined}
          className={`${floatingOptions ? "fixed" : inlineOptions ? (compact ? "relative mt-1" : "relative mt-2") : "absolute inset-x-0 bottom-full z-30 mb-1"} rounded-xl border border-slate-200 bg-white ${compact ? "p-1" : "p-1.5"} shadow-lg`}
        >
          <ul
            ref={list}
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            className="relative max-h-52 overflow-y-auto"
            style={floatingOptions ? { maxHeight: listHeight } : undefined}
          >
            {results.map((option, index) => (
              <li
                id={`${id}-${index}`}
                key={option.value}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  // Dentro de un label, el clic también activaría el input y
                  // su onFocus volvería a abrir la lista recién cerrada.
                  event.preventDefault();
                  choose(option);
                }}
                className={`flex cursor-pointer items-center justify-between gap-2 break-words rounded-lg px-3 ${compact ? "py-1.5 text-xs" : "py-2.5 text-sm"} hover:bg-teal-50 ${index === active ? "bg-teal-50 text-teal-800" : "text-slate-700"}`}
              >
                {option.label}
                {option.value === value && (
                  <Check
                    size={15}
                    className="shrink-0 text-teal-700"
                    aria-hidden
                  />
                )}
              </li>
            ))}
          </ul>
          {!results.length && (
            <p role="status" className="px-3 py-2 text-xs text-slate-500">
              Sin coincidencias.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
