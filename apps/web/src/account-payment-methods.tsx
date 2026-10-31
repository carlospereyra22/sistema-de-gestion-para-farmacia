import { useState } from "react";
import { Banknote, ArrowLeftRight, CreditCard } from "lucide-react";
import type { ReceiptMethod } from "./lib/account-mixed-payment";

export function AccountPaymentMethods({
  value,
  onChange,
}: {
  value: ReceiptMethod;
  onChange: (value: ReceiptMethod) => void;
}) {
  const [hint, setHint] = useState<ReceiptMethod | null>(null);
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {(
        [
          { value: "CASH", label: "Efectivo", icon: Banknote },
          { value: "TRANSFER", label: "Transferencia", icon: ArrowLeftRight },
          { value: "CARD", label: "Tarjeta", icon: CreditCard },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          onMouseEnter={() => setHint(option.value)}
          onMouseLeave={() => setHint(null)}
          onFocus={() => setHint(option.value)}
          onBlur={() => setHint(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setHint(null);
          }}
          className={`relative flex h-11 min-w-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${value === option.value ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
        >
          <option.icon size={24} strokeWidth={1.6} aria-hidden="true" />
          <span
            aria-hidden="true"
            hidden={hint !== option.value}
            className="absolute bottom-full left-1/2 z-50 -translate-x-1/2 pb-1.5"
          >
            <span className="block whitespace-nowrap rounded-lg border border-[#d3e5e0] bg-white px-2.5 py-1.5 text-[11px] font-normal leading-4 text-slate-600 shadow-md">
              {option.label}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
