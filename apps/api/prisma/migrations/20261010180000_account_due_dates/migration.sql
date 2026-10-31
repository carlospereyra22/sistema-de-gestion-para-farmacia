ALTER TABLE "Customer" ADD COLUMN "accountTermDays" INTEGER;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_accountTermDays_check"
  CHECK ("accountTermDays" IS NULL OR "accountTermDays" BETWEEN 0 AND 3650);
ALTER TABLE "Sale" ADD COLUMN "accountDueDate" DATE;
-- Existing sales intentionally remain undated; never infer historical terms.
