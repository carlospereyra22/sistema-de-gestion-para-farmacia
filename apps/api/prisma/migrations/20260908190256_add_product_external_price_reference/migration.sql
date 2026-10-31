-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "externalReferenceBarcode" TEXT,
ADD COLUMN     "externalReferenceCheckedAt" TIMESTAMPTZ(6),
ADD COLUMN     "externalReferenceName" TEXT,
ADD COLUMN     "externalReferencePresentation" TEXT,
ADD COLUMN     "externalReferencePriceMinor" BIGINT,
ADD COLUMN     "externalReferenceSource" TEXT,
ADD COLUMN     "externalReferenceUpdatedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "Product_externalReferenceSource_idx" ON "Product"("externalReferenceSource");
