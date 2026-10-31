-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'LEASED', 'PRINTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PrintGateway" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "secretHash" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ(6),
    "version" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PrintGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "gatewayId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "windowsPrinterName" VARCHAR(200) NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'windowsRaw',
    "profileVersion" TEXT NOT NULL DEFAULT 'V21_FINAL_DENSITY_4',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "cashRegisterId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "printerId" UUID NOT NULL,
    "gatewayId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "documentType" VARCHAR(20) NOT NULL,
    "documentId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "reprintOfId" UUID,
    "profileVersion" TEXT NOT NULL,
    "rawPayload" BYTEA NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseId" UUID,
    "leaseUntil" TIMESTAMPTZ(6),
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" VARCHAR(300),
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "printedAt" TIMESTAMPTZ(6),
    "failedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintGateway_organizationId_branchId_idx" ON "PrintGateway"("organizationId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintGateway_id_organizationId_branchId_key" ON "PrintGateway"("id", "organizationId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_cashRegisterId_key" ON "Printer"("cashRegisterId");

-- CreateIndex
CREATE INDEX "Printer_organizationId_branchId_idx" ON "Printer"("organizationId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_id_organizationId_branchId_gatewayId_key" ON "Printer"("id", "organizationId", "branchId", "gatewayId");

-- CreateIndex
CREATE INDEX "PrintJob_gatewayId_status_createdAt_idx" ON "PrintJob"("gatewayId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PrintJob_organizationId_branchId_documentType_documentId_idx" ON "PrintJob"("organizationId", "branchId", "documentType", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintJob_organizationId_requestId_key" ON "PrintJob"("organizationId", "requestId");

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_gatewayId_organizationId_branchId_fkey" FOREIGN KEY ("gatewayId", "organizationId", "branchId") REFERENCES "PrintGateway"("id", "organizationId", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerId_organizationId_branchId_gatewayId_fkey" FOREIGN KEY ("printerId", "organizationId", "branchId", "gatewayId") REFERENCES "Printer"("id", "organizationId", "branchId", "gatewayId") ON DELETE RESTRICT ON UPDATE CASCADE;
