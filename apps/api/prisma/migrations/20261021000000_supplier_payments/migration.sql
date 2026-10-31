CREATE UNIQUE INDEX "SupplierPayableInvoice_id_organizationId_branchId_key" ON "SupplierPayableInvoice"("id","organizationId","branchId");
CREATE UNIQUE INDEX "SupplierPayableDue_id_invoiceId_key" ON "SupplierPayableDue"("id","invoiceId");
CREATE TABLE "SupplierPayablePayment" (
 "id" UUID PRIMARY KEY, "invoiceId" UUID NOT NULL, "organizationId" UUID NOT NULL, "branchId" UUID NOT NULL,
 "operationId" UUID NOT NULL, "requestHash" VARCHAR(64) NOT NULL,
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0 AND "amountMinor" <= 99999999999999),
 "paidOn" DATE NOT NULL, "method" VARCHAR(20) NOT NULL CHECK ("method" IN ('CASH','TRANSFER','CHECK','OTHER')),
 "reference" VARCHAR(160), "createdById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "createdByName" VARCHAR(160) NOT NULL, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMPTZ(6), "voidedById" UUID REFERENCES "User"("id") ON DELETE RESTRICT,
 "voidedByName" VARCHAR(160), "voidReason" VARCHAR(300),
 FOREIGN KEY ("invoiceId","organizationId","branchId") REFERENCES "SupplierPayableInvoice"("id","organizationId","branchId") ON DELETE RESTRICT,
 CHECK (("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND length(trim("voidReason")) >= 3))
);
CREATE UNIQUE INDEX "SupplierPayablePayment_organizationId_operationId_key" ON "SupplierPayablePayment"("organizationId","operationId");
CREATE UNIQUE INDEX "SupplierPayablePayment_id_invoiceId_key" ON "SupplierPayablePayment"("id","invoiceId");
CREATE INDEX "SupplierPayablePayment_invoiceId_createdAt_idx" ON "SupplierPayablePayment"("invoiceId","createdAt");
CREATE TABLE "SupplierPayableAllocation" (
 "id" UUID PRIMARY KEY, "invoiceId" UUID NOT NULL, "paymentId" UUID NOT NULL, "dueId" UUID NOT NULL,
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0),
 FOREIGN KEY ("paymentId","invoiceId") REFERENCES "SupplierPayablePayment"("id","invoiceId") ON DELETE RESTRICT,
 FOREIGN KEY ("dueId","invoiceId") REFERENCES "SupplierPayableDue"("id","invoiceId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SupplierPayableAllocation_paymentId_dueId_key" ON "SupplierPayableAllocation"("paymentId","dueId");
CREATE FUNCTION check_supplier_payment_balances() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
 target := COALESCE(NEW."invoiceId", OLD."invoiceId");
 PERFORM id FROM "SupplierPayableInvoice" WHERE id=target FOR UPDATE;
 IF EXISTS (SELECT 1 FROM "SupplierPayablePayment" p LEFT JOIN "SupplierPayableAllocation" a ON a."paymentId"=p.id WHERE p."invoiceId"=target GROUP BY p.id HAVING p."amountMinor" <> COALESCE(SUM(a."amountMinor"),0)) THEN RAISE EXCEPTION 'Payment allocations must equal payment total'; END IF;
 IF EXISTS (SELECT 1 FROM "SupplierPayableDue" d JOIN "SupplierPayableAllocation" a ON a."dueId"=d.id JOIN "SupplierPayablePayment" p ON p.id=a."paymentId" WHERE d."invoiceId"=target AND p."voidedAt" IS NULL GROUP BY d.id HAVING SUM(a."amountMinor") > d."amountMinor") THEN RAISE EXCEPTION 'Payments cannot exceed due balance'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "SupplierPayment_balance" AFTER INSERT OR UPDATE OR DELETE ON "SupplierPayablePayment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_supplier_payment_balances();
CREATE CONSTRAINT TRIGGER "SupplierAllocation_balance" AFTER INSERT OR UPDATE OR DELETE ON "SupplierPayableAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_supplier_payment_balances();
