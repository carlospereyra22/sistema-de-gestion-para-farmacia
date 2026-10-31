import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";

export function AccountBranchSelector({
  branches,
  value,
  onChange,
}: {
  branches: ReadonlyArray<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div
      ref={root}
      className="relative min-w-0 w-full"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Sucursal activa"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-teal-100 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-sm hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        <MapPin size={15} className="shrink-0 text-teal-600" />
        <span className="min-w-0 flex-1 break-words">
          {branches.find((branch) => branch.id === value)?.name ??
            "Seleccionar sucursal"}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-teal-600 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          id={listId}
          aria-label="Sucursales disponibles"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-44 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-lg [scrollbar-width:thin]"
        >
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              aria-pressed={branch.id === value}
              onClick={() => {
                if (branch.id !== value) onChange(branch.id);
                setOpen(false);
                trigger.current?.focus();
              }}
              className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-teal-600 ${branch.id === value ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <span className="break-words">{branch.name}</span>
              {branch.id === value && <Check size={15} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
