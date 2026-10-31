ALTER TABLE "Purchase" ADD COLUMN "clientOperationId" UUID, ADD COLUMN "requestHash" TEXT,
ADD COLUMN "reference" VARCHAR(120), ADD COLUMN "notes" VARCHAR(1000),
ADD COLUMN "closedAt" TIMESTAMPTZ(6), ADD COLUMN "closedReason" VARCHAR(300);
ALTER TABLE "PurchaseItem" ADD COLUMN "cancelledQuantity" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Purchase_organizationId_branchId_clientOperationId_key" ON "Purchase"("organizationId", "branchId", "clientOperationId");
CREATE TABLE "PurchaseReceipt" (
 "id" UUID PRIMARY KEY, "purchaseId" UUID NOT NULL REFERENCES "Purchase"("id") ON DELETE RESTRICT,
 "organizationId" UUID NOT NULL, "branchId" UUID NOT NULL, "operationId" UUID NOT NULL,
 "requestHash" TEXT NOT NULL, "actorId" UUID NOT NULL, "actorName" TEXT NOT NULL,
 "notes" VARCHAR(1000), "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PurchaseReceipt_organizationId_branchId_operationId_key" ON "PurchaseReceipt"("organizationId", "branchId", "operationId");
CREATE INDEX "PurchaseReceipt_purchaseId_createdAt_idx" ON "PurchaseReceipt"("purchaseId", "createdAt");
CREATE TABLE "PurchaseReceiptItem" (
 "id" UUID PRIMARY KEY, "receiptId" UUID NOT NULL REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT,
 "purchaseItemId" UUID NOT NULL REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT,
 "productId" UUID NOT NULL, "productName" TEXT NOT NULL,
 "lotId" UUID NOT NULL REFERENCES "ProductLot"("id") ON DELETE RESTRICT,
 "lotNumber" TEXT NOT NULL, "expiresAt" TIMESTAMPTZ(6), "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
 "unitCostMinor" BIGINT NOT NULL CHECK ("unitCostMinor" >= 0),
 "movementId" UUID NOT NULL REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "PurchaseReceiptItem_movementId_key" ON "PurchaseReceiptItem"("movementId");
CREATE INDEX "PurchaseReceiptItem_purchaseItemId_idx" ON "PurchaseReceiptItem"("purchaseItemId");
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_pending_nonnegative" CHECK ("orderedQuantity" > 0 AND "receivedQuantity" >= 0 AND "cancelledQuantity" >= 0 AND "receivedQuantity" + "cancelledQuantity" <= "orderedQuantity") NOT VALID;
