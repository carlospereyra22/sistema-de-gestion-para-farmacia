ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_CANCELLATION';

CREATE TYPE "CustomerReturnStatus" AS ENUM ('RECEIVED_NOT_RESTOCKED');

CREATE TABLE "CustomerReturn" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CustomerReturnStatus" NOT NULL DEFAULT 'RECEIVED_NOT_RESTOCKED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerReturnItem" (
    "id" UUID NOT NULL,
    "customerReturnId" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "CustomerReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierReturn" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerReturn_organizationId_branchId_createdAt_idx" ON "CustomerReturn"("organizationId", "branchId", "createdAt");
CREATE INDEX "CustomerReturn_saleId_idx" ON "CustomerReturn"("saleId");
CREATE INDEX "CustomerReturnItem_customerReturnId_idx" ON "CustomerReturnItem"("customerReturnId");
CREATE INDEX "CustomerReturnItem_saleItemId_idx" ON "CustomerReturnItem"("saleItemId");
CREATE INDEX "SupplierReturn_organizationId_branchId_createdAt_idx" ON "SupplierReturn"("organizationId", "branchId", "createdAt");
CREATE INDEX "SupplierReturn_supplierId_idx" ON "SupplierReturn"("supplierId");

ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerReturnItem" ADD CONSTRAINT "CustomerReturnItem_customerReturnId_fkey" FOREIGN KEY ("customerReturnId") REFERENCES "CustomerReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerReturnItem" ADD CONSTRAINT "CustomerReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
