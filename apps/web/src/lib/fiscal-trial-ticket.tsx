import type { ThermalTicket } from "@gestion/contracts";
import type { FiscalTrial } from "./api";
import { thermalTicketHtml } from "./thermal-ticket";

const date = (value: string | null) =>
  value?.length === 8
    ? `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
    : "—";
export function trialTicket(trial: FiscalTrial) {
  if (trial.status !== "AUTHORIZED" || !trial.cae || !trial.number)
    throw new Error("Sólo se imprimen comprobantes autorizados por ARCA.");
  const production = trial.environment === "PRODUCTION";
  if (production && (!trial.qrUrl || !trial.saleSnapshot?.items.length))
    throw new Error("Faltan datos del comprobante productivo; no se imprime.");
  const items = trial.saleSnapshot?.items;
  const subtotal =
    items?.reduce(
      (sum, item) => sum + BigInt(item.unitPriceMinor) * BigInt(item.quantity),
      0n,
    ) ?? BigInt(trial.totalMinor);
  const discount =
    items?.reduce((sum, item) => sum + BigInt(item.discountMinor), 0n) ?? 0n;
  const ticket: ThermalTicket = trial.ticket ?? {
    kind: "sale",
    id: trial.id,
    number: trial.id.slice(0, 8).toUpperCase(),
    date: `${trial.date.slice(0, 4)}-${trial.date.slice(4, 6)}-${trial.date.slice(6, 8)}T12:00:00-03:00`,
    store: trial.saleSnapshot?.store ?? { name: trial.issuer.legalName },
    branch: trial.saleSnapshot?.branchName ?? "",
    cashier: trial.saleSnapshot?.cashier,
    customer: trial.saleSnapshot?.recipient.name || "Consumidor final",
    items: items?.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      amountMinor: (
        BigInt(item.unitPriceMinor) * BigInt(item.quantity)
      ).toString(),
    })) ?? [
      {
        name: "Artículo de prueba",
        quantity: 1,
        unitPriceMinor: String(trial.totalMinor),
        amountMinor: String(trial.totalMinor),
      },
    ],
    subtotalMinor: String(subtotal),
    discountMinor: String(discount),
    totalMinor: String(trial.totalMinor),
    payments: [],
    note: production
      ? trial.kind === "CREDIT_NOTE"
        ? `Nota de crédito · ${trial.reason ?? ""}`
        : undefined
      : trial.sourceSaleId
        ? "VENTA DE PRUEBA · STOCK Y COBROS REGISTRADOS"
        : "PRUEBA · SIN MOVIMIENTOS DE STOCK NI CAJA",
  };
  const document = trial.saleSnapshot?.recipient.docNumber;
  return thermalTicketHtml(ticket, "", {
    letter: [11, 13].includes(trial.voucherType) ? "C" : "B",
    number: `${String(trial.point).padStart(5, "0")}-${String(trial.number).padStart(8, "0")}`,
    date: date(trial.date),
    legalName: trial.issuer.legalName,
    cuit: trial.issuer.cuit,
    address: [trial.issuer.address, trial.issuer.city, trial.issuer.province]
      .filter(Boolean)
      .join(" · "),
    vatCondition:
      trial.issuer.vatCondition === "MONOTAX"
        ? "Monotributista"
        : trial.issuer.vatCondition === "EXEMPT"
          ? "IVA exento"
          : "Responsable inscripto",
    grossIncomeId: trial.issuer.grossIncomeId,
    activityStart: trial.issuer.activityStart,
    recipientDocument: document && document !== "0" ? document : undefined,
    cae: trial.cae,
    caeExpires: date(trial.caeExpires),
    demo: !production,
    qrUrl: trial.qrUrl ?? undefined,
    creditNote: trial.kind === "CREDIT_NOTE",
    originalNumber: trial.saleSnapshot?.originalNumber,
    recipientVatCondition:
      trial.saleSnapshot?.recipient.vatId === 5
        ? "A CONSUMIDOR FINAL"
        : (
            {
              1: "Responsable inscripto",
              4: "IVA exento",
              6: "Monotributista",
            } as Record<number, string>
          )[trial.saleSnapshot?.recipient.vatId ?? 5],
  });
}
