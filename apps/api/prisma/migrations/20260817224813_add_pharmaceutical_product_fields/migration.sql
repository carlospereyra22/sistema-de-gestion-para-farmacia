-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "activeIngredient" TEXT,
ADD COLUMN     "concentration" TEXT,
ADD COLUMN     "pharmaceuticalForm" TEXT,
ADD COLUMN     "prescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "presentation" TEXT;
