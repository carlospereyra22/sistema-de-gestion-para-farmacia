-- Proveedor de cada carga de stock (SISTEMA-36). Null: entró sin proveedor. Las
-- unidades de cada proveedor en un lote se calculan desde estas cargas.
ALTER TABLE "InventoryMovement" ADD COLUMN "supplierId" UUID;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplierId_organizationId_fkey" FOREIGN KEY ("supplierId", "organizationId") REFERENCES "Supplier"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "InventoryMovement_lotId_occurredAt_idx" ON "InventoryMovement"("lotId", "occurredAt");
CREATE INDEX "SupplierReturn_lotId_idx" ON "SupplierReturn"("lotId");

-- Las recepciones de Compras ya registran su proveedor: es un dato, no una
-- inferencia. Lo recibido antes por Inventario queda sin proveedor.
UPDATE "InventoryMovement" movement
SET "supplierId" = purchase."supplierId"
FROM "Purchase" purchase
WHERE movement."type" = 'PURCHASE_RECEIPT'
  AND movement."referenceType" = 'PURCHASE'
  AND movement."referenceId" = purchase."id";
