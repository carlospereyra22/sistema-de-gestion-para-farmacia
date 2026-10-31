ALTER TABLE "CashPendingCollection"
  ADD COLUMN "destinationRegisterId" UUID,
  ADD COLUMN "destinationSetAt" TIMESTAMPTZ(6),
  ADD COLUMN "destinationSetById" UUID,
  ADD CONSTRAINT "CashPendingCollection_destination_fkey" FOREIGN KEY ("destinationRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "CashPendingCollection_destination_check" CHECK (
    ("destinationRegisterId" IS NULL AND "destinationSetAt" IS NULL AND "destinationSetById" IS NULL) OR
    ("destinationRegisterId" IS NOT NULL AND "destinationSetAt" IS NOT NULL AND "destinationSetById" IS NOT NULL)
  );
