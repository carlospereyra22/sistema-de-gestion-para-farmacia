import type { AccountReceipt } from "./api";
import { accountTicket, thermalTicketHtml } from "./thermal-ticket";

export function accountReceiptHtml(
  receipt: AccountReceipt,
  origin: string,
): string {
  return thermalTicketHtml(accountTicket(receipt), origin);
}
