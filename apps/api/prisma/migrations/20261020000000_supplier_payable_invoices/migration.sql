-- Administrative supplier documents only: no historic purchase conversion or stock/cash writes.
CREATE UNIQUE INDEX "Supplier_id_organizationId_key" ON "Supplier"("id","organizationId");
CREATE UNIQUE INDEX "Purchase_id_organizationId_branchId_supplierId_key" ON "Purchase"("id","organizationId","branchId","supplierId");
CREATE TABLE "SupplierPayableInvoice" (
 "id" UUID PRIMARY KEY, "organizationId" UUID NOT NULL, "branchId" UUID NOT NULL,
 "supplierId" UUID NOT NULL, "purchaseId" UUID,
 "documentType" VARCHAR(20) NOT NULL CHECK ("documentType" IN ('FACTURA_A','FACTURA_B','FACTURA_C','OTRO')),
 "pointOfSale" VARCHAR(10) NOT NULL, "documentNumber" VARCHAR(60) NOT NULL,
 "documentKey" VARCHAR(80) NOT NULL, "issuedOn" DATE NOT NULL,
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0 AND "amountMinor" <= 99999999999999),
 "reference" VARCHAR(120), "notes" VARCHAR(1000),
 "operationId" UUID NOT NULL, "requestHash" VARCHAR(64) NOT NULL,
 "createdById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "createdByName" VARCHAR(160) NOT NULL, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("supplierId","organizationId") REFERENCES "Supplier"("id","organizationId") ON DELETE RESTRICT,
 FOREIGN KEY ("branchId","organizationId") REFERENCES "Branch"("id","organizationId") ON DELETE RESTRICT,
 FOREIGN KEY ("purchaseId","organizationId","branchId","supplierId") REFERENCES "Purchase"("id","organizationId","branchId","supplierId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SupplierPayableInvoice_organizationId_operationId_key" ON "SupplierPayableInvoice"("organizationId","operationId");
CREATE UNIQUE INDEX "PayableInvoice_document_key" ON "SupplierPayableInvoice"("organizationId","supplierId","documentType","documentKey");
CREATE INDEX "SupplierPayableInvoice_organizationId_branchId_issuedOn_idx" ON "SupplierPayableInvoice"("organizationId","branchId","issuedOn");
CREATE INDEX "SupplierPayableInvoice_organizationId_supplierId_idx" ON "SupplierPayableInvoice"("organizationId","supplierId");
CREATE INDEX "SupplierPayableInvoice_purchaseId_idx" ON "SupplierPayableInvoice"("purchaseId");
CREATE TABLE "SupplierPayableDue" (
 "id" UUID PRIMARY KEY, "invoiceId" UUID NOT NULL REFERENCES "SupplierPayableInvoice"("id") ON DELETE RESTRICT,
 "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
 "dueOn" DATE, "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0)
);
CREATE UNIQUE INDEX "SupplierPayableDue_invoiceId_sequence_key" ON "SupplierPayableDue"("invoiceId","sequence");
CREATE INDEX "SupplierPayableDue_dueOn_idx" ON "SupplierPayableDue"("dueOn");
-- Each committed invoice must be covered exactly by its due schedule.
CREATE FUNCTION check_payable_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; total BIGINT; scheduled NUMERIC;
BEGIN
 IF TG_TABLE_NAME = 'SupplierPayableInvoice' THEN target := NEW.id;
 ELSIF TG_OP = 'DELETE' THEN target := OLD."invoiceId";
 ELSE target := NEW."invoiceId"; END IF;
 SELECT "amountMinor" INTO total FROM "SupplierPayableInvoice" WHERE id=target;
 SELECT COALESCE(SUM("amountMinor"),0) INTO scheduled FROM "SupplierPayableDue" WHERE "invoiceId"=target;
 IF total IS NOT NULL AND total <> scheduled THEN RAISE EXCEPTION 'Payable schedule must equal invoice total'; END IF;
 IF TG_TABLE_NAME = 'SupplierPayableDue' AND TG_OP = 'UPDATE' THEN
 IF OLD."invoiceId" <> NEW."invoiceId" THEN
  SELECT "amountMinor" INTO total FROM "SupplierPayableInvoice" WHERE id=OLD."invoiceId";
  SELECT COALESCE(SUM("amountMinor"),0) INTO scheduled FROM "SupplierPayableDue" WHERE "invoiceId"=OLD."invoiceId";
  IF total IS NOT NULL AND total <> scheduled THEN RAISE EXCEPTION 'Payable schedule must equal invoice total'; END IF;
 END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "PayableInvoice_schedule" AFTER INSERT OR UPDATE ON "SupplierPayableInvoice"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_payable_schedule();
CREATE CONSTRAINT TRIGGER "PayableDue_schedule" AFTER INSERT OR UPDATE OR DELETE ON "SupplierPayableDue"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_payable_schedule();
INSERT INTO "Permission" ("id","code","description") VALUES
 (gen_random_uuid(),'PAYABLE_READ','Consultar facturas y vencimientos de proveedores'),
 (gen_random_uuid(),'PAYABLE_MANAGE','Registrar facturas de proveedores')
 ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
 WHERE r.code='ADMIN' AND p.code IN ('PAYABLE_READ','PAYABLE_MANAGE')
 ON CONFLICT DO NOTHING;
