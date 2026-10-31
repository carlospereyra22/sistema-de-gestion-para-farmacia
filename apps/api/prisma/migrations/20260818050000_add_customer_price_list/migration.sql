ALTER TABLE "Customer" ADD COLUMN "priceListId" UUID;
CREATE INDEX "Customer_priceListId_idx" ON "Customer"("priceListId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
