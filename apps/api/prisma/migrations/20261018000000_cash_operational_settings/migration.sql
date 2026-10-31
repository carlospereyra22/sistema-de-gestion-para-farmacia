ALTER TABLE "CashRegister" ADD COLUMN "code" VARCHAR(30);
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY "branchId" ORDER BY name, id) AS number FROM "CashRegister"
) UPDATE "CashRegister" r SET code = 'CJ-' || lpad(numbered.number::text, 6, '0') FROM numbered WHERE r.id = numbered.id;
CREATE UNIQUE INDEX "CashRegister_branchId_code_key" ON "CashRegister"("branchId", "code");
CREATE UNIQUE INDEX "CashRegister_id_branchId_key" ON "CashRegister"("id", "branchId");
CREATE TABLE "CashSettings" (
  "branchId" UUID NOT NULL PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "allowWithoutSession" BOOLEAN NOT NULL DEFAULT true,
  "askOpeningAmount" BOOLEAN NOT NULL DEFAULT true,
  "requireMovementReason" BOOLEAN NOT NULL DEFAULT true,
  "allowManualMovements" BOOLEAN NOT NULL DEFAULT true,
  "defaultRegisterId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "CashSettings_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashSettings_defaultRegisterId_branchId_fkey" FOREIGN KEY ("defaultRegisterId", "branchId") REFERENCES "CashRegister"("id", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE
);
