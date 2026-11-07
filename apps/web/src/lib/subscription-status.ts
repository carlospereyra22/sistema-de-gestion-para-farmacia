import { apiBaseUrl } from "./api";
import type { SubscriptionStage } from "./platform-subscription";

export type SubscriptionCut = {
  access: "READ_ONLY" | "BLOCKED";
  on: string;
  inDays: number;
};

export type SubscriptionStatus = {
  stage: SubscriptionStage;
  access: "FULL" | "READ_ONLY" | "BLOCKED";
  daysOverdue: number;
  coveredUntil: string | null;
  daysLeft: number | null;
  nextCut: SubscriptionCut | null;
  isOwner: boolean;
  balanceMinor: string | null;
};

/** Con tope de tiempo: si la API no contesta, la web sigue como si nada. */
export async function getSubscriptionStatus(
  token: string,
  organizationId: string,
): Promise<SubscriptionStatus> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/subscription/status`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok)
    throw new Error("No se pudo consultar el estado de la farmacia.");
  return (await response.json()) as SubscriptionStatus;
}

const dayLabel = (date: string) => date.split("-").reverse().join("/");

/** Avisos antes de vencer: solo con estos días o menos. */
const NOTICE_DAYS = 5;

const shortDay = (date: string) =>
  date.split("-").reverse().slice(0, 2).join("/");

export type SubscriptionNotice = {
  tone: "info" | "warning" | "danger";
  label: string;
  text: string;
  dismissible: boolean;
};

/**
 * Qué aviso mostrar en el encabezado. Solo lectura lo ven todos, porque explica por qué
 * no se puede vender. Lo anterior lo ve el dueño, para no alarmar al mostrador.
 */
export function subscriptionNotice(
  status: SubscriptionStatus,
): SubscriptionNotice | null {
  if (status.access === "READ_ONLY")
    return {
      tone: "danger",
      dismissible: false,
      label: "Solo lectura por falta de pago",
      text: status.isOwner
        ? `La farmacia está en solo lectura por falta de pago: podés consultar y terminar lo pendiente, pero no vender ni registrar operaciones nuevas.${status.nextCut ? ` Si no se registra el pago, se bloquea el ${dayLabel(status.nextCut.on)}.` : ""}`
        : "La farmacia está en solo lectura: podés consultar y terminar lo pendiente, pero no vender. Avisale al dueño.",
    };
  if (!status.isOwner || status.access !== "FULL") return null;
  if (status.stage === "GRACE")
    return {
      tone: "warning",
      dismissible: true,
      label: "Abono vencido",
      text: status.nextCut
        ? `El abono está vencido. Si no se registra el pago, el ${dayLabel(status.nextCut.on)} la farmacia pasa a solo lectura.`
        : "El abono está vencido.",
    };
  if (
    status.daysLeft === null ||
    status.daysLeft > NOTICE_DAYS ||
    !status.coveredUntil
  )
    return null;
  const when =
    status.daysLeft === 0 ? "hoy" : `el ${dayLabel(status.coveredUntil)}`;
  const subject =
    status.stage === "TRIAL"
      ? "La prueba termina"
      : status.stage === "EXTENDED"
        ? "La prórroga termina"
        : "El abono vence";
  const short =
    status.daysLeft === 0 ? "hoy" : `el ${shortDay(status.coveredUntil)}`;
  return {
    tone: "info",
    dismissible: true,
    label: `${subject.replace(/^(La|El) /, "").replace(/^./, (first) => first.toUpperCase())} ${short}`,
    text: `${subject} ${when}.`,
  };
}

/** Título y explicación de la pantalla de bloqueo. */
export function blockedCopy(status: SubscriptionStatus) {
  const title =
    status.stage === "SUSPENDED"
      ? "Farmacia suspendida"
      : status.stage === "CANCELLED"
        ? "Farmacia dada de baja"
        : "Farmacia bloqueada por falta de pago";
  const body = !status.isOwner
    ? "Por ahora no se puede usar el sistema. Avisale al dueño de la farmacia."
    : status.stage === "BLOCKED"
      ? "Para volver a usar el sistema hay que regularizar el abono. Apenas registremos el pago, la farmacia vuelve a funcionar. Tus datos están guardados."
      : "Comunicate con nosotros para reactivarla. Tus datos están guardados.";
  return { title, body };
}
