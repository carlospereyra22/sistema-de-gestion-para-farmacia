CREATE TABLE "DistributionDispatch" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "branchId" UUID NOT NULL,
  "requestId" UUID NOT NULL, "payloadHash" TEXT NOT NULL, "destination" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMPTZ(6), "reversalReason" TEXT,
  CONSTRAINT "DistributionDispatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DistributionDispatch_organizationId_branchId_requestId_key" ON "DistributionDispatch"("organizationId", "branchId", "requestId");
CREATE INDEX "DistributionDispatch_organizationId_branchId_createdAt_idx" ON "DistributionDispatch"("organizationId", "branchId", "createdAt");
CREATE TABLE "DistributionDispatchItem" (
  "id" UUID NOT NULL, "dispatchId" UUID NOT NULL, "productId" UUID NOT NULL,
  "lotId" UUID NOT NULL, "productName" TEXT NOT NULL, "lotNumber" TEXT NOT NULL,
  "expiresAt" DATE, "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  CONSTRAINT "DistributionDispatchItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DistributionDispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "DistributionDispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DistributionDispatchItem_dispatchId_lotId_key" ON "DistributionDispatchItem"("dispatchId", "lotId");
-- Enforce nonnegative stock for all future writes, including concurrent legacy operations.
-- NOT VALID preserves historical rows without rewriting or deleting them.
ALTER TABLE "ProductLot" ADD CONSTRAINT "ProductLot_quantity_nonnegative" CHECK ("quantity" >= 0) NOT VALID;
