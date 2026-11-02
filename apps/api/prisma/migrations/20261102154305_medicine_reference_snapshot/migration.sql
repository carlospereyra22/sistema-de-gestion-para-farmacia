-- SISTEMA-21: copia local de las fuentes de medicamentos compartida por todas
-- las organizaciones, registro de corridas de actualización de precios,
-- cambios por corrida (para deshacerla) y ajustes de plataforma.

CREATE TABLE "MedicineReferenceSnapshot" (
    "id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "lookupKey" TEXT NOT NULL DEFAULT '',
    "gtin" VARCHAR(14),
    "barcode" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "presentation" TEXT NOT NULL DEFAULT '',
    "laboratory" TEXT NOT NULL DEFAULT '',
    "activeIngredient" TEXT NOT NULL DEFAULT '',
    "pharmaceuticalForm" TEXT NOT NULL DEFAULT '',
    "concentration" TEXT NOT NULL DEFAULT '',
    "troquel" TEXT NOT NULL DEFAULT '',
    "saleType" TEXT NOT NULL DEFAULT '',
    "prescriptionRequired" BOOLEAN,
    "priceMinor" BIGINT,
    "pamiPriceMinor" BIGINT,
    "sourceUpdatedAt" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "runId" UUID NOT NULL,
    "refreshedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineReferenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceRefreshRun" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "trigger" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "snapshotRows" INTEGER,
    "checked" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "revertedAt" TIMESTAMPTZ(6),

    CONSTRAINT "PriceRefreshRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceRefreshChange" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "priceListId" UUID,
    "beforeAmountMinor" BIGINT,
    "afterAmountMinor" BIGINT,
    "beforeReferenceMinor" BIGINT,
    "afterReferenceMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceRefreshChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSetting" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "MedicineReferenceSnapshot_source_gtin_idx" ON "MedicineReferenceSnapshot"("source", "gtin");
CREATE INDEX "MedicineReferenceSnapshot_source_lookupKey_idx" ON "MedicineReferenceSnapshot"("source", "lookupKey");
CREATE INDEX "PriceRefreshRun_startedAt_idx" ON "PriceRefreshRun"("startedAt");
CREATE INDEX "PriceRefreshChange_runId_idx" ON "PriceRefreshChange"("runId");
CREATE INDEX "PriceRefreshChange_organizationId_createdAt_idx" ON "PriceRefreshChange"("organizationId", "createdAt");

ALTER TABLE "PriceRefreshChange"
  ADD CONSTRAINT "PriceRefreshChange_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "PriceRefreshRun"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una sola corrida global en curso a la vez, aunque haya varias instancias de
-- la API: la segunda falla al insertar y se omite.
CREATE UNIQUE INDEX "PriceRefreshRun_one_global_running"
  ON "PriceRefreshRun" ((true))
  WHERE "status" = 'RUNNING' AND "organizationId" IS NULL;

ALTER TABLE "PriceRefreshRun"
  ADD CONSTRAINT "PriceRefreshRun_status_check"
  CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABORTED', 'PAUSED'));
ALTER TABLE "PriceRefreshRun"
  ADD CONSTRAINT "PriceRefreshRun_trigger_check"
  CHECK ("trigger" IN ('SCHEDULED', 'COMMAND', 'ORGANIZATION'));
