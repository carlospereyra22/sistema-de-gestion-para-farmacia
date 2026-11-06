import { cashMoney } from "./cash-session-view";

export type PendingCollectionAction = "destination" | "incorporate" | "clear";

/** Textos del popup: cada acción dice qué pasa con el dinero antes de confirmar. */
export function pendingConfirmationCopy(
  action: PendingCollectionAction,
  registerName: string,
  cashMinor: string,
) {
  if (action === "destination")
    return {
      title: "Asignar caja",
      question: `¿Querés asignar este cobro a ${registerName}?`,
      detail:
        "Todavía no ingresa dinero: queda pendiente de incorporar a una sesión.",
      confirm: "Sí, asignar",
    };
  if (action === "clear")
    return {
      title: "Quitar caja",
      question: `¿Querés quitar ${registerName} de este cobro?`,
      detail: "El cobro vuelve a quedar sin caja asignada. No mueve dinero.",
      confirm: "Sí, quitar",
    };
  return {
    title: "Incorporar cobro",
    question: `¿Querés incorporar este cobro a ${registerName}?`,
    detail:
      BigInt(cashMinor) > 0n
        ? `Ingresan ${cashMoney(cashMinor)} de efectivo a la sesión abierta. Después no se puede deshacer.`
        : "No ingresa efectivo a la sesión. Después no se puede deshacer.",
    confirm: "Sí, incorporar",
  };
}
