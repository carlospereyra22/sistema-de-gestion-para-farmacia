-- Parámetros tipados con SPEND_THRESHOLD: monto mínimo y un porcentaje o un
-- monto. Los demás tipos no llevan monto mínimo.
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_parameters";
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_parameters" CHECK (
  CASE "type"
    WHEN 'PERCENT' THEN "percentBps" BETWEEN 1 AND 10000
      AND "amountMinor" IS NULL AND "fixedPriceMinor" IS NULL AND "buyQuantity" IS NULL
      AND "payQuantity" IS NULL AND "nthUnit" IS NULL AND "bundlePriceMinor" IS NULL
    WHEN 'AMOUNT_OFF' THEN "amountMinor" > 0
      AND "percentBps" IS NULL AND "fixedPriceMinor" IS NULL AND "buyQuantity" IS NULL
      AND "payQuantity" IS NULL AND "nthUnit" IS NULL AND "bundlePriceMinor" IS NULL
    WHEN 'FIXED_PRICE' THEN "fixedPriceMinor" >= 0
      AND "percentBps" IS NULL AND "amountMinor" IS NULL AND "buyQuantity" IS NULL
      AND "payQuantity" IS NULL AND "nthUnit" IS NULL AND "bundlePriceMinor" IS NULL
    WHEN 'BUY_X_PAY_Y' THEN "buyQuantity" BETWEEN 2 AND 100
      AND "payQuantity" >= 1 AND "payQuantity" < "buyQuantity"
      AND "percentBps" IS NULL AND "amountMinor" IS NULL AND "fixedPriceMinor" IS NULL
      AND "nthUnit" IS NULL AND "bundlePriceMinor" IS NULL
    WHEN 'NTH_UNIT_PERCENT' THEN "nthUnit" BETWEEN 2 AND 100
      AND "percentBps" BETWEEN 1 AND 10000
      AND "amountMinor" IS NULL AND "fixedPriceMinor" IS NULL AND "buyQuantity" IS NULL
      AND "payQuantity" IS NULL AND "bundlePriceMinor" IS NULL
    WHEN 'TIERED' THEN "percentBps" IS NULL AND "amountMinor" IS NULL
      AND "fixedPriceMinor" IS NULL AND "buyQuantity" IS NULL AND "payQuantity" IS NULL
      AND "nthUnit" IS NULL AND "bundlePriceMinor" IS NULL
    WHEN 'BUNDLE' THEN (("bundlePriceMinor" >= 0 AND "percentBps" IS NULL)
        OR ("bundlePriceMinor" IS NULL AND "percentBps" BETWEEN 1 AND 10000))
      AND "amountMinor" IS NULL AND "fixedPriceMinor" IS NULL AND "buyQuantity" IS NULL
      AND "payQuantity" IS NULL AND "nthUnit" IS NULL
    WHEN 'PAYMENT_METHOD' THEN "percentBps" BETWEEN 1 AND 10000
      AND cardinality("paymentMethods") >= 1
      AND "maxUnitsPerSale" IS NULL AND "maxUnitsTotal" IS NULL
      AND "amountMinor" IS NULL AND "fixedPriceMinor" IS NULL AND "buyQuantity" IS NULL
      AND "payQuantity" IS NULL AND "nthUnit" IS NULL AND "bundlePriceMinor" IS NULL
    WHEN 'SPEND_THRESHOLD' THEN "minPurchaseMinor" > 0
      AND (("percentBps" BETWEEN 1 AND 10000 AND "amountMinor" IS NULL)
        OR ("percentBps" IS NULL AND "amountMinor" > 0))
      AND "maxUnitsPerSale" IS NULL AND "maxUnitsTotal" IS NULL
      AND "fixedPriceMinor" IS NULL AND "buyQuantity" IS NULL
      AND "payQuantity" IS NULL AND "nthUnit" IS NULL AND "bundlePriceMinor" IS NULL
    ELSE false
  END
  AND ("type" = 'PAYMENT_METHOD' OR cardinality("paymentMethods") = 0)
  AND NOT ("type" = 'BUNDLE' AND "allProducts")
  AND ("type" = 'SPEND_THRESHOLD' OR "minPurchaseMinor" IS NULL)
);
