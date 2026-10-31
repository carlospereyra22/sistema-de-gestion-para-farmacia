CREATE UNIQUE INDEX "Branch_id_organizationId_key" ON "Branch"("id", "organizationId");
CREATE TABLE "FiscalPoint" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "environment" VARCHAR(20) NOT NULL DEFAULT 'HOMOLOGATION',
  "number" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "FiscalPoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FiscalPoint_number_check" CHECK ("number" BETWEEN 1 AND 99999),
  CONSTRAINT "FiscalPoint_environment_check" CHECK ("environment" = 'HOMOLOGATION'),
  CONSTRAINT "FiscalPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FiscalPoint_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalPoint_organizationId_environment_number_key" ON "FiscalPoint"("organizationId", "environment", "number");
CREATE INDEX "FiscalPoint_organizationId_branchId_idx" ON "FiscalPoint"("organizationId", "branchId");
