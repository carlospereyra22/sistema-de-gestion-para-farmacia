ALTER TABLE "Product"
  ADD COLUMN "priceDivisor" INTEGER,
  ADD COLUMN "priceMarkupBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "priceBaseMinor" BIGINT;

ALTER TABLE "Product" ADD CONSTRAINT "Product_fractional_price_bounds" CHECK (
  ("priceDivisor" IS NULL OR "priceDivisor" BETWEEN 1 AND 1000000)
  AND "priceMarkupBps" BETWEEN 0 AND 1000000
  AND ("priceBaseMinor" IS NULL OR "priceBaseMinor" BETWEEN 0 AND 999999999999)
);
