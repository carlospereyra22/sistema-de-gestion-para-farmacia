CREATE TABLE "CashPendingCollection" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "sourceType" VARCHAR(16) NOT NULL,
  "sourceId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "collectedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cashMinor" BIGINT NOT NULL,
  "cardMinor" BIGINT NOT NULL,
  "transferMinor" BIGINT NOT NULL,
  "changeMinor" BIGINT NOT NULL DEFAULT 0,
  "assignedSessionId" UUID,
  "assignedAt" TIMESTAMPTZ(6),
  "assignedById" UUID,
  "voidedAt" TIMESTAMPTZ(6),
  CONSTRAINT "CashPendingCollection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashPendingCollection_scope_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT,
  CONSTRAINT "CashPendingCollection_session_fkey" FOREIGN KEY ("assignedSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT,
  CONSTRAINT "CashPendingCollection_amounts_check" CHECK ("cashMinor" >= 0 AND "cardMinor" >= 0 AND "transferMinor" >= 0 AND "changeMinor" >= 0),
  CONSTRAINT "CashPendingCollection_type_check" CHECK ("sourceType" IN ('SALE', 'RECEIPT')),
  CONSTRAINT "CashPendingCollection_assignment_check" CHECK (("assignedAt" IS NULL AND "assignedSessionId" IS NULL AND "assignedById" IS NULL) OR ("assignedAt" IS NOT NULL AND "assignedSessionId" IS NOT NULL AND "assignedById" IS NOT NULL))
);
CREATE UNIQUE INDEX "CashPendingCollection_organizationId_sourceType_sourceId_key" ON "CashPendingCollection"("organizationId", "sourceType", "sourceId");
CREATE INDEX "CashPendingCollection_scope_pending_idx" ON "CashPendingCollection"("organizationId", "branchId", "assignedAt", "collectedAt");
