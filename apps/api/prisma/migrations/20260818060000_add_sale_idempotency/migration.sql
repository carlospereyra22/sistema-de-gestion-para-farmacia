ALTER TABLE "Sale" ADD COLUMN "clientOperationId" UUID;

CREATE UNIQUE INDEX "Sale_organizationId_clientOperationId_key"
ON "Sale"("organizationId", "clientOperationId");
