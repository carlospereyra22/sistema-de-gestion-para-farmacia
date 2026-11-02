-- SISTEMA-20: el código de barras pasa a ser único por organización (antes era
-- único en toda la base) y se registra su tipo: envase, interno SG o
-- equivalente (EAN de un envase importado del mismo medicamento).

CREATE TYPE "ProductBarcodeKind" AS ENUM ('PACKAGE', 'INTERNAL', 'EQUIVALENT');

ALTER TABLE "ProductBarcode" ADD COLUMN "organizationId" UUID;
ALTER TABLE "ProductBarcode" ADD COLUMN "kind" "ProductBarcodeKind" NOT NULL DEFAULT 'PACKAGE';

-- Cada código toma la organización de su producto.
UPDATE "ProductBarcode" AS barcode
SET "organizationId" = product."organizationId"
FROM "Product" AS product
WHERE product."id" = barcode."productId";

-- Los códigos SG generados por el sistema son internos; el resto queda como envase.
UPDATE "ProductBarcode"
SET "kind" = 'INTERNAL'
WHERE "primary" = false AND "code" ~ '^SG[0-9]{12}$';

ALTER TABLE "ProductBarcode" ALTER COLUMN "organizationId" SET NOT NULL;

-- La organización del código siempre coincide con la de su producto.
CREATE UNIQUE INDEX "Product_id_organizationId_key" ON "Product"("id", "organizationId");
ALTER TABLE "ProductBarcode" DROP CONSTRAINT "ProductBarcode_productId_fkey";
ALTER TABLE "ProductBarcode"
  ADD CONSTRAINT "ProductBarcode_productId_organizationId_fkey"
  FOREIGN KEY ("productId", "organizationId")
  REFERENCES "Product"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "ProductBarcode_code_key";
CREATE UNIQUE INDEX "ProductBarcode_organizationId_code_key" ON "ProductBarcode"("organizationId", "code");

-- El principal siempre es el del envase; el interno conserva el formato SG y
-- el equivalente es un EAN/GTIN numérico de 8 a 14 dígitos.
ALTER TABLE "ProductBarcode"
  ADD CONSTRAINT "ProductBarcode_primary_package_check"
  CHECK (NOT "primary" OR "kind" = 'PACKAGE');
ALTER TABLE "ProductBarcode"
  ADD CONSTRAINT "ProductBarcode_internal_format_check"
  CHECK ("kind" <> 'INTERNAL' OR "code" ~ '^SG[0-9]{12}$');
ALTER TABLE "ProductBarcode"
  ADD CONSTRAINT "ProductBarcode_equivalent_format_check"
  CHECK ("kind" <> 'EQUIVALENT' OR (NOT "primary" AND "code" ~ '^[0-9]{8,14}$'));
