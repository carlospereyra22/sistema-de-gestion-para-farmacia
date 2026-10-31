ALTER TABLE "Supplier" ADD COLUMN "accountEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accountTermDays" INTEGER;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_account_term" CHECK ("accountTermDays" IS NULL OR "accountTermDays" BETWEEN 0 AND 3650);
ALTER TABLE "SupplierPayableInvoice" ALTER COLUMN "documentKey" DROP NOT NULL,
  ADD COLUMN "receiptId" UUID;
CREATE UNIQUE INDEX "SupplierPayableInvoice_receiptId_key" ON "SupplierPayableInvoice"("receiptId");
CREATE UNIQUE INDEX "PurchaseReceipt_id_purchaseId_organizationId_branchId_key" ON "PurchaseReceipt"("id", "purchaseId", "organizationId", "branchId");
ALTER TABLE "SupplierPayableInvoice" ADD CONSTRAINT "Payable_receipt_scope" FOREIGN KEY ("receiptId", "purchaseId", "organizationId", "branchId") REFERENCES "PurchaseReceipt"("id", "purchaseId", "organizationId", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayableInvoice" ADD CONSTRAINT "Payable_receipt_purchase" CHECK ("receiptId" IS NULL OR "purchaseId" IS NOT NULL);
