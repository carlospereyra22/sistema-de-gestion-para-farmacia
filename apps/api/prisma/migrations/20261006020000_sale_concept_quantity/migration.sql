-- Keep existing concepts and permit positive whole quantities, without stock.
ALTER TABLE "SaleItem" DROP CONSTRAINT "SaleItem_product_or_concept";
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_product_or_concept" CHECK (
  ("productId" IS NOT NULL AND "description" IS NULL)
  OR ("productId" IS NULL AND "lotId" IS NULL AND length(trim("description")) BETWEEN 3 AND 160 AND "description" IS NOT NULL AND "quantity" >= 1 AND "unitPriceMinor" > 0)
);
