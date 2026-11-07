import { createContext } from "react";
import type { SubscriptionStatus } from "./subscription-status";

export type SubscriptionNoticeState = {
  status: SubscriptionStatus;
  storageKey: string;
};

/** Lleva el estado del abono hasta el encabezado del sistema, donde va el aviso. */
export const SubscriptionNoticeContext =
  createContext<SubscriptionNoticeState | null>(null);
