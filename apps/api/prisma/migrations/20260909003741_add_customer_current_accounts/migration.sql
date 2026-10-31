-- CreateEnum
CREATE TYPE "CustomerAccountMovementType" AS ENUM ('DEBIT', 'CREDIT');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ACCOUNT';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "creditEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creditLimitMinor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CustomerAccountMovement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "saleId" UUID,
    "type" "CustomerAccountMovementType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAccountMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerAccountMovement_organizationId_customerId_createdAt_idx" ON "CustomerAccountMovement"("organizationId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAccountMovement_saleId_idx" ON "CustomerAccountMovement"("saleId");

-- AddForeignKey
ALTER TABLE "CustomerAccountMovement" ADD CONSTRAINT "CustomerAccountMovement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountMovement" ADD CONSTRAINT "CustomerAccountMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
