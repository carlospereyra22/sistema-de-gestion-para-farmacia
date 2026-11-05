-- Costo de cada recepción (SISTEMA-32). Aditiva: las filas existentes quedan en
-- NULL y la API resuelve su costo desde PurchaseReceiptItem o el lote.
ALTER TABLE "InventoryMovement" ADD COLUMN "unitCostMinor" BIGINT;
