-- CreateEnum
CREATE TYPE "SaleUnit" AS ENUM ('BOX', 'BLISTER', 'UNIT');

-- DropIndex
DROP INDEX "Customer_priceListId_idx";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "saleUnit" "SaleUnit" NOT NULL DEFAULT 'BOX';
