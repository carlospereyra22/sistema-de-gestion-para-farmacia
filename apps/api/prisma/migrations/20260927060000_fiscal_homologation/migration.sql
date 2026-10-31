ALTER TABLE "FiscalCredential" ADD COLUMN "encryptedTicket" TEXT, ADD COLUMN "ticketExpiresAt" TIMESTAMPTZ(6), ADD COLUMN "verifiedAt" TIMESTAMPTZ(6);
CREATE TABLE "FiscalTrial" (
 "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "requestId" UUID NOT NULL,
 "environment" VARCHAR(20) NOT NULL DEFAULT 'HOMOLOGATION',
 "point" INTEGER NOT NULL, "voucherType" INTEGER NOT NULL, "number" INTEGER,
 "date" VARCHAR(8) NOT NULL, "totalMinor" INTEGER NOT NULL, "issuer" JSONB NOT NULL,
 "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', "cae" TEXT, "caeExpires" TEXT, "detail" TEXT,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "FiscalTrial_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "FiscalTrial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FiscalTrial_testing_only" CHECK ("environment" = 'HOMOLOGATION'),
 CONSTRAINT "FiscalTrial_status" CHECK ("status" IN ('PENDING','AUTHORIZED','REJECTED','UNCERTAIN')),
 CONSTRAINT "FiscalTrial_values" CHECK ("point" BETWEEN 1 AND 99999 AND "voucherType" IN (6,11) AND "totalMinor" > 0)
);
CREATE UNIQUE INDEX "FiscalTrial_organizationId_requestId_key" ON "FiscalTrial"("organizationId", "requestId");
CREATE INDEX "FiscalTrial_organizationId_status_idx" ON "FiscalTrial"("organizationId", "status");
