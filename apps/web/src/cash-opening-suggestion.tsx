import type { ReactElement } from "react";
import { cashMoney } from "./lib/cash-session-view";

/** Ofrece el contado del último cierre como fondo inicial. Nunca lo completa solo. */
export function CashOpeningSuggestion({
  amountMinor,
  onUse,
}: {
  amountMinor: string;
  onUse: () => void;
}): ReactElement {
  const amount = cashMoney(amountMinor);
  return (
    <div className="cash-opening-suggestion">
      <span>
        Dinero efectivo contado en el último cierre <strong>{amount}</strong>
      </span>
      <button
        type="button"
        aria-label={`Usar el efectivo contado en el último cierre: ${amount}`}
        onClick={onUse}
      >
        Usar
      </button>
    </div>
  );
}
