import { formatAmountTyping } from "./amount-typing";
import { typedCashMinor } from "./cash-count";

// Límite guardado como texto de MoneyInput. El cero queda vacío para que lo que
// se escriba no se pegue al 0 y se muestre el 0,00 de referencia.
export function creditLimitText(minor: string | null | undefined): string {
  if (!minor || /^0+$/.test(minor)) return "";
  const digits = minor.padStart(3, "0");
  const cents = digits.slice(-2);
  const whole = formatAmountTyping(digits.slice(0, -2));
  return cents === "00" ? whole : `${whole},${cents}`;
}

// Vacío es tope cero; un texto inválido es null para pedir corregirlo.
export const creditLimitMinor = (text: string): number | null =>
  text.trim() ? typedCashMinor(text) : 0;

// El plazo vacío significa tanto "sin configurar" como "Sin vencimiento" elegido.
// Con tope cero todavía no hay condiciones definidas y se propone A plazo; con
// un límite cargado o sin límite se respeta lo guardado.
export const proposesPaymentTerm = (account: {
  creditLimitMinor: string | null;
  accountTermDays?: number | null;
}) =>
  account.accountTermDays == null &&
  account.creditLimitMinor !== null &&
  /^0+$/.test(account.creditLimitMinor);

// Cargar un importe es querer darle crédito. Sin límite no entra acá: no
// habilita por sí solo, según las reglas de cuenta corriente.
export const limitEnablesCredit = (text: string) =>
  (creditLimitMinor(text) ?? 0) > 0;
