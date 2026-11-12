-- Abrir cajas (SISTEMA-103): una caja (ej. Buscapina x100) se abre en N
-- unidades de otro producto del catálogo (Buscapina blíster x10).
ALTER TABLE "Product" ADD COLUMN "splitTargetProductId" UUID;
ALTER TABLE "Product" ADD COLUMN "splitFactor" INTEGER;

ALTER TABLE "Product" ADD CONSTRAINT "Product_splitTargetProductId_organizationId_fkey"
  FOREIGN KEY ("splitTargetProductId", "organizationId")
  REFERENCES "Product"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_split_link" CHECK (
  ("splitTargetProductId" IS NULL AND "splitFactor" IS NULL)
  OR (
    "splitTargetProductId" IS NOT NULL
    AND "splitTargetProductId" <> "id"
    AND "splitFactor" BETWEEN 2 AND 1000
  )
);

CREATE TABLE "StockSplit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "sourceProductId" UUID NOT NULL,
    "targetProductId" UUID NOT NULL,
    "sourceLotId" UUID NOT NULL,
    "targetLotId" UUID NOT NULL,
    "boxes" INTEGER NOT NULL,
    "factor" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "purchaseReceiptId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockSplit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockSplit_positive" CHECK ("boxes" > 0 AND "factor" BETWEEN 2 AND 1000)
);

CREATE UNIQUE INDEX "StockSplit_organizationId_requestId_key" ON "StockSplit"("organizationId", "requestId");
CREATE INDEX "StockSplit_organizationId_branchId_createdAt_idx" ON "StockSplit"("organizationId", "branchId", "createdAt");
CREATE INDEX "StockSplit_sourceLotId_idx" ON "StockSplit"("sourceLotId");
CREATE INDEX "StockSplit_targetLotId_idx" ON "StockSplit"("targetLotId");
