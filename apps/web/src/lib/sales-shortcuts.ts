export type SalesPaymentMethod = "CASH" | "CARD" | "TRANSFER" | "ACCOUNT";

export type SalesShortcut =
  | { action: "checkout" }
  | { action: "increment-last-line" }
  | { action: "decrement-last-line" }
  | { action: "payment-method"; method: SalesPaymentMethod };

// Mismo orden que la ventana de cobro: Efectivo, Tarjeta, Transferencia, Cuenta corriente.
const PAYMENT_KEYS: Record<string, SalesPaymentMethod> = {
  "1": "CASH",
  "2": "CARD",
  "3": "TRANSFER",
  "4": "ACCOUNT",
};

export function salesShortcut(
  event: {
    key: string;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    isComposing: boolean;
    repeat: boolean;
    defaultPrevented: boolean;
  },
  context: { editing: boolean; blocked: boolean; checkoutOpen: boolean },
): SalesShortcut | undefined {
  if (
    context.blocked ||
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    event.altKey ||
    event.metaKey
  )
    return undefined;
  // Ctrl + Enter tambien funciona desde un campo: abre el cobro o lo confirma.
  if (event.ctrlKey)
    return event.key === "Enter" && !event.shiftKey
      ? { action: "checkout" }
      : undefined;
  if (context.editing) return undefined;
  if (context.checkoutOpen) {
    const method = PAYMENT_KEYS[event.key];
    return method ? { action: "payment-method", method } : undefined;
  }
  if (event.key === "+") return { action: "increment-last-line" };
  if (event.key === "-") return { action: "decrement-last-line" };
  return undefined;
}
