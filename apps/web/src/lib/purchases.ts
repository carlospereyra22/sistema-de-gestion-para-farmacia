import { apiBaseUrl, type Purchase } from "./api";
export const purchaseStatus = (p: Pick<Purchase, "status" | "closedAt">) =>
  p.closedAt
    ? "Saldo cerrado"
    : {
        ORDERED: "Pendiente de recepción",
        PARTIALLY_RECEIVED: "Recibida parcialmente",
        RECEIVED: "Recibida",
        CANCELLED: "Cancelada",
        DRAFT: "Borrador",
      }[p.status];
export const purchasePending = (i: Purchase["items"][number]) =>
  Math.max(
    0,
    i.orderedQuantity - i.receivedQuantity - (i.cancelledQuantity ?? 0),
  );
export type PurchaseDraftLine = {
  productId: string;
  quantity: string;
  cost: string;
};
export type ReceiptDraft = {
  key: string;
  itemId: string;
  quantity: string;
  lotNumber: string;
  expiresAt: string;
};
export type PurchaseDetail = Purchase & {
  receipts: {
    id: string;
    operationId: string;
    createdAt: string;
    actorName: string;
    notes: string | null;
    items: {
      id: string;
      productName: string;
      quantity: number;
      lotNumber: string;
      expiresAt: string | null;
      unitCostMinor: string;
      movementId: string;
    }[];
  }[];
  legacyMovements: {
    id: string;
    occurredAt: string;
    quantity: number;
    lotNumber: string;
    actorId: string;
  }[];
};
export class PurchaseRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function purchaseRequest<T>(
  token: string,
  organizationId: string,
  branchId: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/purchases${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const error = (await response.json()) as { message?: string | string[] };
    throw new PurchaseRequestError(
      Array.isArray(error.message)
        ? error.message.join(", ")
        : (error.message ?? "No se pudo guardar la operación."),
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
export function preparePurchaseLines(lines: PurchaseDraftLine[]) {
  if (
    !lines.length ||
    lines.length > 100 ||
    new Set(lines.map((i) => i.productId)).size !== lines.length
  )
    throw new Error("Agregá entre 1 y 100 productos sin repetir.");
  return lines.map((i) => {
    const quantity = Number(i.quantity),
      unitCostMinor = Math.round(Number(i.cost) * 100);
    if (
      !i.quantity.trim() ||
      !i.cost.trim() ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000 ||
      !Number.isSafeInteger(unitCostMinor) ||
      unitCostMinor < 0 ||
      !Number.isSafeInteger(quantity * unitCostMinor)
    )
      throw new Error("Revisá cantidades y costos de los artículos.");
    return { productId: i.productId, quantity, unitCostMinor };
  });
}
export function prepareReceiptLines(
  rows: ReceiptDraft[],
  items: Purchase["items"],
) {
  const selected = rows.filter((r) => Number(r.quantity) !== 0);
  if (!selected.length)
    throw new Error("Indicá la cantidad que llegó en al menos un lote.");
  const totals = new Map<string, number>();
  const result = selected.map((r) => {
    const quantity = Number(r.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !r.lotNumber.trim())
      throw new Error(
        "Cada lote recibido necesita cantidad entera positiva y número de lote.",
      );
    if (!items.some((i) => i.id === r.itemId))
      throw new Error("El artículo no pertenece a esta compra.");
    totals.set(r.itemId, (totals.get(r.itemId) ?? 0) + quantity);
    return {
      itemId: r.itemId,
      quantity,
      lotNumber: r.lotNumber.trim(),
      expiresAt: r.expiresAt || undefined,
    };
  });
  if (items.some((i) => (totals.get(i.id) ?? 0) > purchasePending(i)))
    throw new Error("La suma de los lotes supera el pendiente de un artículo.");
  return result;
}
