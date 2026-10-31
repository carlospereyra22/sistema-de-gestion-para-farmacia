import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export function ProductFilterSelect({
  label,
  value,
  options,
  icon,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  icon: ReactNode;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [active, setActive] = useState(0);
  const search = useRef({ text: "", time: 0 });
  const selected = options.findIndex((option) => option.value === value);
  const show = () => {
    const bounds = root.current?.getBoundingClientRect();
    const body = root.current
      ?.closest("[data-product-editor-body]")
      ?.getBoundingClientRect();
    setAbove(
      Boolean(
        bounds &&
        body &&
        body.bottom - bounds.bottom < 170 &&
        bounds.top - body.top > 170,
      ),
    );
    setActive(Math.max(0, selected));
    setOpen(true);
  };
  const choose = (index: number) => {
    if (options[index]) onChange(options[index]!.value);
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (!open || !list.current) return;
    const item = list.current.children[active] as HTMLElement | undefined;
    const container = list.current;
    if (!item) return;
    if (item.offsetTop < container.scrollTop)
      container.scrollTop = item.offsetTop;
    else if (
      item.offsetTop + item.offsetHeight >
      container.scrollTop + container.clientHeight
    )
      container.scrollTop =
        item.offsetTop + item.offsetHeight - container.clientHeight;
  }, [active, open]);
  return (
    <div
      ref={root}
      className="product-catalog-filter relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={
          open && options[active] ? `${id}-${active}` : undefined
        }
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            setOpen(false);
          } else if (event.key === "Escape") {
            if (open) event.preventDefault();
            setOpen(false);
            event.stopPropagation();
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) show();
            else
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
          } else if (open && (event.key === "Home" || event.key === "End")) {
            event.preventDefault();
            setActive(event.key === "Home" ? 0 : options.length - 1);
          } else if (open && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            choose(active);
          } else if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            event.key !== " "
          ) {
            const now = Date.now();
            search.current = {
              text:
                (now - search.current.time < 700 ? search.current.text : "") +
                event.key.toLocaleLowerCase("es"),
              time: now,
            };
            const found = options.findIndex((option) =>
              option.label
                .toLocaleLowerCase("es")
                .startsWith(search.current.text),
            );
            if (found >= 0) {
              setActive(found);
              setOpen(true);
            }
          }
        }}
        className={`flex ${compact ? "h-10" : "h-12"} w-full min-w-0 items-center gap-2 rounded-lg border bg-white px-3 text-left shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${open ? "border-teal-400 ring-2 ring-teal-500/10" : "border-slate-200"}`}
      >
        {icon && <span className="shrink-0 text-teal-600">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span
            className={
              compact
                ? "sr-only"
                : "block text-[11px] font-semibold text-slate-700"
            }
          >
            {label}
          </span>
          <span
            className={`block truncate ${compact ? "text-sm text-slate-700" : "text-[11px] leading-4 text-slate-500"}`}
          >
            {options[selected]?.label ?? "Seleccionar"}
          </span>
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-teal-700 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className={`absolute inset-x-0 z-50 min-w-0 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(15,60,80,.25)] ${above ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <ul
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            className="product-filter-options relative max-h-56 overflow-y-auto overscroll-contain"
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === value}
                onPointerMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 break-words rounded-lg px-3 py-2.5 text-xs ${index === active ? "bg-teal-50 text-teal-800" : "text-slate-600"} ${option.value === value ? "font-semibold" : ""}`}
              >
                {option.label}
                {option.value === value && (
                  <Check size={15} className="shrink-0 text-teal-600" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
