export type PurchaseLineInput = {
  productId: string;
  quantity: number;
  unitCostMinor: number;
};
export type PurchaseInput = {
  supplierId: string;
  clientOperationId?: string;
  reference?: string;
  notes?: string;
  orderedAt?: string;
  items: PurchaseLineInput[];
};
export type ReceiptLineInput = {
  itemId: string;
  quantity: number;
  lotNumber: string;
  expiresAt?: Date;
};
export type ReceiptInput = {
  debt?: { amountMinor: string; dueOn: string | null };
  operationId: string;
  notes?: string;
  items: ReceiptLineInput[];
};
export type DirectPurchaseInput = PurchaseInput & {
  debt?: ReceiptInput["debt"];
  clientOperationId: string;
  receipts: {
    productId: string;
    quantity: number;
    lotNumber: string;
    expiresAt?: Date;
  }[];
};
