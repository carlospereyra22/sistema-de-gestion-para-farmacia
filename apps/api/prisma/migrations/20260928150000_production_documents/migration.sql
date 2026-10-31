-- New tables only. Historical FiscalTrial rows remain homologation forever.
CREATE TABLE "FiscalProductionConfiguration" (
  "id" UUID PRIMARY KEY, "organizationId" UUID NOT NULL, "branchId" UUID NOT NULL,
  "point" INTEGER NOT NULL CHECK ("point" BETWEEN 1 AND 99999),
  "issuerCuit" VARCHAR(11) NOT NULL, "credentialVersion" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "exclusiveConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "activatedAt" TIMESTAMPTZ(6), "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalProductionConfiguration_branchId_key" ON "FiscalProductionConfiguration"("branchId");
CREATE UNIQUE INDEX "FiscalProductionConfiguration_branchId_organizationId_key" ON "FiscalProductionConfiguration"("branchId", "organizationId");
CREATE UNIQUE INDEX "FiscalProductionConfiguration_organizationId_point_key" ON "FiscalProductionConfiguration"("organizationId", "point");
CREATE TABLE "FiscalDocument" (
  "id" UUID PRIMARY KEY, "organizationId" UUID NOT NULL, "branchId" UUID NOT NULL,
  "sourceSaleId" UUID NOT NULL, "requestId" UUID NOT NULL,
  "environment" VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION' CHECK ("environment" = 'PRODUCTION'),
  "kind" VARCHAR(20) NOT NULL CHECK ("kind" IN ('INVOICE','CREDIT_NOTE')),
  "originalId" UUID, "status" VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
    CHECK ("status" IN ('QUEUED','PENDING','UNCERTAIN','AUTHORIZED','REJECTED')),
  "issuerCuit" VARCHAR(11) NOT NULL, "point" INTEGER NOT NULL CHECK ("point" BETWEEN 1 AND 99999),
  "voucherType" INTEGER NOT NULL, "number" INTEGER CHECK ("number" BETWEEN 1 AND 99999999),
  "date" VARCHAR(8) NOT NULL, "totalMinor" INTEGER NOT NULL CHECK ("totalMinor" > 0),
  "docType" INTEGER NOT NULL, "docNumber" VARCHAR(11) NOT NULL, "recipientVatId" INTEGER NOT NULL,
  "issuer" JSONB NOT NULL, "saleSnapshot" JSONB NOT NULL, "reason" TEXT,
  "cae" TEXT, "caeExpires" TEXT, "detail" TEXT, "settlement" JSONB, "settledAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "FiscalDocument_kind_voucher_check" CHECK (("kind"='INVOICE' AND "voucherType"=11 AND "originalId" IS NULL) OR ("kind"='CREDIT_NOTE' AND "voucherType"=13 AND "originalId" IS NOT NULL)),
  CONSTRAINT "FiscalDocument_authorized_check" CHECK ("status" <> 'AUTHORIZED' OR ("number" IS NOT NULL AND "cae" IS NOT NULL AND "caeExpires" IS NOT NULL AND "cae" ~ '^[0-9]{14}$' AND "caeExpires" ~ '^[0-9]{8}$')),
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("sourceSaleId", "organizationId") REFERENCES "Sale"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalDocument_id_organizationId_key" ON "FiscalDocument"("id", "organizationId");
ALTER TABLE "FiscalDocument" ADD FOREIGN KEY ("originalId", "organizationId") REFERENCES "FiscalDocument"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "FiscalDocument_organizationId_requestId_key" ON "FiscalDocument"("organizationId", "requestId");
CREATE INDEX "FiscalDocument_organizationId_status_idx" ON "FiscalDocument"("organizationId", "status");
CREATE INDEX "FiscalDocument_sourceSaleId_idx" ON "FiscalDocument"("sourceSaleId");
CREATE UNIQUE INDEX "FiscalDocument_one_invoice" ON "FiscalDocument"("sourceSaleId") WHERE "kind"='INVOICE';
CREATE INDEX "FiscalDocument_originalId_idx" ON "FiscalDocument"("originalId");
CREATE UNIQUE INDEX "FiscalDocument_reserved_number" ON "FiscalDocument"("issuerCuit", "point", "voucherType", "number") WHERE "status" IN ('PENDING','UNCERTAIN','AUTHORIZED');
