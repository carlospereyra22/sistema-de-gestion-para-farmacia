CREATE TABLE "TransferItem" (
  "id" UUID NOT NULL,
  "transferId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "lotId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TransferItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TransferItem_transferId_idx" ON "TransferItem"("transferId");
ALTER TABLE "TransferItem" ADD CONSTRAINT "TransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
