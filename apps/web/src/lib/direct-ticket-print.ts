import type { ThermalTicket } from "@gestion/contracts";
import { prepareThermalTicket, sendThermalTicket } from "./thermal-agent";

type Attempt = { requestId: string; status: "pending" | "sent" };
const flights = new Map<string, Promise<void>>();
export class ExistingPrintAttempt extends Error {
  constructor(public readonly status: Attempt["status"]) {
    super(
      status === "sent"
        ? "Este ticket ya fue enviado. Para imprimir otra copia, confirmalo abajo."
        : "Hay un envío anterior sin confirmación. Revisá el papel y la cola; no se volvió a imprimir automáticamente.",
    );
  }
}
export async function directTicketPrint(
  ticket: ThermalTicket,
  mode: "initial" | "retry" | "copy" = "initial",
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): Promise<void> {
  const key = `gestion:ticket-attempt:${ticket.kind}:${ticket.id}`;
  const active = flights.get(key);
  if (active) return active;
  const operation = async () => {
    const raw = storage.getItem(key);
    const prior = raw ? (JSON.parse(raw) as Attempt) : undefined;
    if (prior && mode === "initial")
      throw new ExistingPrintAttempt(prior.status);
    if (prior?.status === "sent" && mode === "retry") return;
    await prepareThermalTicket(ticket);
    const attempt: Attempt = {
      requestId:
        mode !== "copy" && prior ? prior.requestId : crypto.randomUUID(),
      status: "pending",
    };
    // Persist BEFORE sending. A reload or network error must not silently create another job.
    storage.setItem(key, JSON.stringify(attempt));
    await sendThermalTicket(ticket, attempt.requestId);
    storage.setItem(key, JSON.stringify({ ...attempt, status: "sent" }));
  };
  const promise = operation().finally(() => flights.delete(key));
  flights.set(key, promise);
  return promise;
}
