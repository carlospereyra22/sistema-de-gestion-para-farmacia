ALTER TABLE "CashSession" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_archive_closed_check" CHECK ("archivedAt" IS NULL OR "closedAt" IS NOT NULL);
ALTER TABLE "ProductLot" ADD COLUMN "metadataVersion" INTEGER NOT NULL DEFAULT 0;
