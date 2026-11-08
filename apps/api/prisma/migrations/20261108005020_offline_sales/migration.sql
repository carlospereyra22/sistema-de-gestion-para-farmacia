-- Modo sin internet (SISTEMA-63): operaciones hechas sin conexión y sus avisos.
-- Sólo tablas nuevas: no modifica ni rellena datos existentes.

CREATE TABLE "OfflineOperation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "actorId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestHash" VARCHAR(64) NOT NULL,
    "entityId" UUID,

    CONSTRAINT "OfflineOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OfflineOperation_kind_check" CHECK ("kind" IN ('SALE', 'CASH_MOVEMENT', 'ACCOUNT_RECEIPT')),
    CONSTRAINT "OfflineOperation_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "OfflineSyncIssue" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "saleId" UUID,
    "kind" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedById" UUID,
    "resolutionNote" TEXT,

    CONSTRAINT "OfflineSyncIssue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OfflineSyncIssue_kind_check" CHECK ("kind" IN (
      'PRECIO_DISTINTO', 'STOCK_FALTANTE', 'PRODUCTO_NO_DISPONIBLE',
      'CLIENTE_INACTIVO', 'LISTA_INACTIVA', 'LIMITE_CREDITO', 'CAJA_CERRADA',
      'FACTURA_NO_PREPARADA', 'MOVIMIENTO_RETENIDO', 'EGRESO_SUPERA_EFECTIVO',
      'SALDO_A_FAVOR'
    )),
    CONSTRAINT "OfflineSyncIssue_status_check" CHECK ("status" IN ('OPEN', 'RESOLVED')),
    CONSTRAINT "OfflineSyncIssue_resolved_check" CHECK (
      ("status" = 'OPEN' AND "resolvedAt" IS NULL AND "resolvedById" IS NULL)
      OR ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "resolvedById" IS NOT NULL)
    )
);

CREATE INDEX "OfflineOperation_organizationId_branchId_receivedAt_idx" ON "OfflineOperation"("organizationId", "branchId", "receivedAt");
CREATE UNIQUE INDEX "OfflineOperation_id_organizationId_key" ON "OfflineOperation"("id", "organizationId");
CREATE INDEX "OfflineSyncIssue_organizationId_branchId_status_createdAt_idx" ON "OfflineSyncIssue"("organizationId", "branchId", "status", "createdAt");
CREATE INDEX "OfflineSyncIssue_saleId_idx" ON "OfflineSyncIssue"("saleId");

ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_operationId_organizationId_fkey" FOREIGN KEY ("operationId", "organizationId") REFERENCES "OfflineOperation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_saleId_organizationId_fkey" FOREIGN KEY ("saleId", "organizationId") REFERENCES "Sale"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
