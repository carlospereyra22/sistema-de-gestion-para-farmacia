-- A writer waiting on an unused product's deletion must not create an orphan.
CREATE OR REPLACE FUNCTION guard_removed_product_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM "Product" WHERE id=NEW."productId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_PRODUCT_UNAVAILABLE'; END IF;
  IF NEW.quantity > 0 AND EXISTS (
    SELECT 1 FROM "ProductBranchState" WHERE "productId"=NEW."productId"
      AND "branchId"=NEW."branchId" AND status='DELETED'
  ) THEN RAISE EXCEPTION 'BRANCH_PRODUCT_REMOVED'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_archived_product_sale() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE branch uuid;
BEGIN
  IF NEW."productId" IS NULL THEN RETURN NEW; END IF;
  PERFORM id FROM "Product" WHERE id=NEW."productId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_PRODUCT_UNAVAILABLE'; END IF;
  SELECT "branchId" INTO branch FROM "Sale" WHERE id=NEW."saleId";
  IF EXISTS (SELECT 1 FROM "ProductBranchState" WHERE "productId"=NEW."productId"
    AND "branchId"=branch AND status <> 'ACTIVE') THEN
    RAISE EXCEPTION 'BRANCH_PRODUCT_UNAVAILABLE';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_archived_product_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE branches uuid[];
BEGIN
  PERFORM id FROM "Product" WHERE id=NEW."productId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_PRODUCT_UNAVAILABLE'; END IF;
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
