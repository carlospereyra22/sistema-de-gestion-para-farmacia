ALTER TABLE "PriceList" ADD COLUMN "fallbackPriceListId" UUID;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_fallbackPriceListId_fkey"
  FOREIGN KEY ("fallbackPriceListId") REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_fallback_not_self"
  CHECK ("fallbackPriceListId" IS NULL OR "fallbackPriceListId" <> "id");
CREATE INDEX "PriceList_fallbackPriceListId_idx" ON "PriceList"("fallbackPriceListId");
