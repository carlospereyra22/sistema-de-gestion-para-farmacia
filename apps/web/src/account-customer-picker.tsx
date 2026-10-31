import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { AccountCustomerList } from "./account-customer-panels";
import type { CustomerAccount } from "./lib/api";

export function AccountCustomerPicker({
  accounts,
  selectedId,
  disabled,
  loading,
  onSelect,
}: {
  accounts: CustomerAccount[];
  selectedId: string;
  disabled: boolean;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const selected = accounts.find((account) => account.id === selectedId);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const closeOnFocusOutside = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("focusin", closeOnFocusOutside);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("focusin", closeOnFocusOutside);
    };
  }, [open]);
  return (
    <div
      ref={root}
      className="relative min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          input.current?.focus();
          setOpen(false);
        }
        if (event.key === "ArrowDown" && event.target === input.current) {
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() =>
            root.current
              ?.querySelector<HTMLButtonElement>(
                "[data-customer-options] button",
              )
              ?.focus(),
          );
        }
      }}
    >
      <label
        className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500"
        htmlFor={`${panelId}-input`}
      >
        Cliente
      </label>
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400"
        />
        <input
          ref={input}
          id={`${panelId}-input`}
          aria-label="Buscar y seleccionar cliente"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          autoComplete="off"
          disabled={disabled || loading}
          placeholder={loading ? "Cargando clientes…" : "Buscar cliente…"}
          value={open ? query : (selected?.name ?? "")}
          onFocus={() => {
            if (!open) {
              setQuery("");
              setOpen(true);
            }
          }}
          onClick={() => {
            if (!open) {
              setQuery("");
              setOpen(true);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-9 text-sm focus:border-teal-500 focus:outline-none"
        />
        <button
          type="button"
          aria-label={
            open ? "Cerrar selector de clientes" : "Abrir selector de clientes"
          }
          disabled={disabled || loading}
          onClick={() => {
            setQuery("");
            setOpen(!open);
          }}
          className="absolute right-1 top-1 rounded-md p-1.5 text-teal-700"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Seleccionar cliente"
          data-customer-options
          className="absolute inset-x-0 top-full z-40 mt-2 min-w-0"
        >
          <AccountCustomerList
            dropdown
            accounts={accounts}
            selectedId={selectedId}
            disabled={disabled}
            loading={loading}
            query={query}
            onQuery={setQuery}
            onSelect={(id) => {
              onSelect(id);
              input.current?.focus();
              setOpen(false);
              setQuery("");
            }}
          />
        </div>
      )}
    </div>
  );
}
