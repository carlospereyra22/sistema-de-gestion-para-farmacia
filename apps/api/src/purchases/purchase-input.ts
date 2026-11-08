export type PurchaseLineInput = {
  productId: string;
  quantity: number;
  unitCostMinor: number;
  packFactor?: number;
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
  /** Recepción hecha sin conexión: cuándo pasó de verdad (SISTEMA-69). */
  occurredAt?: Date;
};
export type DirectPurchaseInput = PurchaseInput & {
  debt?: ReceiptInput["debt"];
  clientOperationId: string;
  /** Compra directa hecha sin conexión: cuándo se recibió (SISTEMA-69). */
  occurredAt?: Date;
  receipts: {
    productId: string;
    quantity: number;
    lotNumber: string;
    expiresAt?: Date;
  }[];
};

/** Operación de Compras hecha sin conexión (SISTEMA-69). */
export type OperacionCompraSinConexion =
  | { tipo: "PEDIDO"; occurredAt: string; cuerpo: PurchaseInput }
  | { tipo: "DIRECTA"; occurredAt: string; cuerpo: DirectPurchaseInput }
  | {
      tipo: "RECEPCION";
      occurredAt: string;
      purchaseId: string;
      cuerpo: ReceiptInput;
    };
