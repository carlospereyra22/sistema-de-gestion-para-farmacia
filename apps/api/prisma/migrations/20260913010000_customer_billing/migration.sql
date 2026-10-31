ALTER TABLE "Customer"
ADD COLUMN "billingName" VARCHAR(160),
ADD COLUMN "billingTaxId" VARCHAR(32),
ADD COLUMN "billingVatCondition" VARCHAR(80),
ADD COLUMN "billingAddress" VARCHAR(200),
ADD COLUMN "billingCity" VARCHAR(100),
ADD COLUMN "billingProvince" VARCHAR(100),
ADD COLUMN "billingPostalCode" VARCHAR(20),
ADD COLUMN "billingEmail" VARCHAR(254),
ADD COLUMN "billingPhone" VARCHAR(40);
