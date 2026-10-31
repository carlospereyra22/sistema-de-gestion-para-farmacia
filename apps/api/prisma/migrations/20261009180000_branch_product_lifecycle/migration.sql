CREATE TABLE "ProductBranchState" (
  "organizationId" uuid NOT NULL,
  "branchId" uuid NOT NULL REFERENCES "Branch"(id) ON DELETE RESTRICT,
  "productId" uuid NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("branchId", "productId")
);
CREATE INDEX "ProductBranchState_organizationId_branchId_status_idx"
ON "ProductBranchState" ("organizationId", "branchId", status);

-- Serialize lifecycle changes and physical writes, including older API clients.
CREATE FUNCTION check_branch_product_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org uuid;
BEGIN
  SELECT "organizationId" INTO org FROM "Product" WHERE id=NEW."productId" FOR UPDATE;
  IF org IS DISTINCT FROM NEW."organizationId" OR NOT EXISTS (
    SELECT 1 FROM "Branch" WHERE id=NEW."branchId" AND "organizationId"=org
  ) THEN RAISE EXCEPTION 'BRANCH_PRODUCT_TENANT'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER branch_product_tenant BEFORE INSERT OR UPDATE ON "ProductBranchState"
FOR EACH ROW EXECUTE FUNCTION check_branch_product_state();

CREATE FUNCTION guard_removed_product_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM "Product" WHERE id=NEW."productId" FOR UPDATE;
  IF NEW.quantity > 0 AND EXISTS (
    SELECT 1 FROM "ProductBranchState" WHERE "productId"=NEW."productId"
      AND "branchId"=NEW."branchId" AND status='DELETED'
  ) THEN RAISE EXCEPTION 'BRANCH_PRODUCT_REMOVED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER removed_product_stock BEFORE INSERT OR UPDATE OF quantity ON "ProductLot"
FOR EACH ROW EXECUTE FUNCTION guard_removed_product_stock();

CREATE FUNCTION guard_archived_product_sale() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE branch uuid;
BEGIN
  IF NEW."productId" IS NULL THEN RETURN NEW; END IF;
  PERFORM id FROM "Product" WHERE id=NEW."productId" FOR UPDATE;
  SELECT "branchId" INTO branch FROM "Sale" WHERE id=NEW."saleId";
  IF EXISTS (SELECT 1 FROM "ProductBranchState" WHERE "productId"=NEW."productId"
    AND "branchId"=branch AND status <> 'ACTIVE') THEN
    RAISE EXCEPTION 'BRANCH_PRODUCT_UNAVAILABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER archived_product_sale BEFORE INSERT ON "SaleItem"
FOR EACH ROW EXECUTE FUNCTION guard_archived_product_sale();

CREATE FUNCTION guard_archived_product_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE branches uuid[];
BEGIN
  PERFORM id FROM "Product" WHERE id=NEW."productId" FOR UPDATE;
  IF TG_TABLE_NAME='PurchaseItem' THEN
    SELECT ARRAY["branchId"] INTO branches FROM "Purchase" WHERE id=NEW."purchaseId";
  ELSE
    SELECT ARRAY["sourceBranchId", "destinationBranchId"] INTO branches FROM "Transfer" WHERE id=NEW."transferId";
  END IF;
  IF EXISTS (SELECT 1 FROM "ProductBranchState" WHERE "productId"=NEW."productId"
    AND "branchId"=ANY(branches) AND status <> 'ACTIVE') THEN
    RAISE EXCEPTION 'BRANCH_PRODUCT_UNAVAILABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER archived_product_purchase BEFORE INSERT ON "PurchaseItem"
FOR EACH ROW EXECUTE FUNCTION guard_archived_product_order();
CREATE TRIGGER archived_product_transfer BEFORE INSERT ON "TransferItem"
FOR EACH ROW EXECUTE FUNCTION guard_archived_product_order();
