ALTER TABLE "Product" ADD COLUMN "brand" VARCHAR(120), ADD COLUMN "isMedication" BOOLEAN NOT NULL DEFAULT false;
-- Preserve existing medicinal workflows; users can explicitly correct individual products.
UPDATE "Product" p SET "isMedication" = true
WHERE p."externalReferenceSource" IS NOT NULL OR p."prescriptionRequired" = true
OR EXISTS (SELECT 1 FROM "Category" c WHERE c.id = p."categoryId" AND lower(c.name) = 'medicamentos');
