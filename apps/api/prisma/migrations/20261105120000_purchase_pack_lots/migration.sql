-- Exhibidores por lote (SISTEMA-26): el renglón de compra recuerda que vino en
-- exhibidor y el lote, cuántos entraron. Solo columnas nuevas, sin rellenar datos.

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN "packFactor" INTEGER;

-- AlterTable
ALTER TABLE "ProductLot"
  ADD COLUMN "packFactor" INTEGER,
  ADD COLUMN "packCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_packFactor_check"
  CHECK ("packFactor" IS NULL OR "packFactor" BETWEEN 2 AND 1000);

ALTER TABLE "ProductLot" ADD CONSTRAINT "ProductLot_packFactor_check"
  CHECK ("packFactor" IS NULL OR "packFactor" BETWEEN 2 AND 1000);

ALTER TABLE "ProductLot" ADD CONSTRAINT "ProductLot_packCount_check"
  CHECK ("packCount" >= 0);
