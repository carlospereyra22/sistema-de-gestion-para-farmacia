ALTER TABLE "Sale" ADD COLUMN "documentType" VARCHAR(20) NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_document_type" CHECK ("documentType" IN ('INTERNAL', 'INVOICE'));
CREATE UNIQUE INDEX "Sale_id_organizationId_key" ON "Sale"("id", "organizationId");
ALTER TABLE "FiscalTrial" ADD COLUMN "sourceSaleId" UUID, ADD COLUMN "saleSnapshot" JSONB,
 ADD COLUMN "docType" INTEGER NOT NULL DEFAULT 99, ADD COLUMN "docNumber" VARCHAR(11) NOT NULL DEFAULT '0';
CREATE UNIQUE INDEX "FiscalTrial_sourceSaleId_key" ON "FiscalTrial"("sourceSaleId");
ALTER TABLE "FiscalTrial" ADD CONSTRAINT "FiscalTrial_sourceSaleId_organizationId_fkey" FOREIGN KEY ("sourceSaleId","organizationId") REFERENCES "Sale"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalTrial" DROP CONSTRAINT "FiscalTrial_status";
ALTER TABLE "FiscalTrial" ADD CONSTRAINT "FiscalTrial_status" CHECK ("status" IN ('QUEUED','PENDING','AUTHORIZED','REJECTED','UNCERTAIN'));
