import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, HandCoins, TrendingUp, RefreshCw } from "lucide-react";

export function AccountCollectionMenu({
  disabled,
  unavailable,
  onDelivery,
  onIncrease,
  onPrices,
}: {
  disabled: boolean;
  unavailable: boolean;
  onDelivery: () => void;
  onIncrease?: () => void;
  onPrices?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <div
      ref={ref}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          ref.current?.querySelector("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label="Más opciones de cuenta corriente"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-700 disabled:opacity-40"
      >
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-max rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-lg">
          {[
            {
              label: "Cobro parcial",
              icon: HandCoins,
              action: onDelivery,
              blocked: unavailable,
            },
            {
              label: "Aumentar total",
              icon: TrendingUp,
              action: onIncrease,
              blocked: unavailable,
            },
            ...(onPrices
              ? [
                  {
                    label: "Actualizar precios",
                    icon: RefreshCw,
                    action: onPrices,
                    blocked: false,
                  },
                ]
              : []),
          ]
            .filter((option) => option.action)
            .map(({ label, icon: Icon, action, blocked }) => (
              <button
                key={label}
                type="button"
                disabled={disabled || blocked}
                onClick={() => {
                  setOpen(false);
                  action?.();
                }}
                className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-slate-600 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-40"
              >
                <Icon size={15} className="text-teal-700" />
                {label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
