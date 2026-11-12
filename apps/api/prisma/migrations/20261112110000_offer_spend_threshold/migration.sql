-- Ofertas por monto de compra (SISTEMA-103). El valor nuevo del enum se usa
-- en la migración siguiente: Postgres no deja usarlo en la misma transacción.
ALTER TYPE "OfferType" ADD VALUE 'SPEND_THRESHOLD';

ALTER TABLE "Offer" ADD COLUMN "minPurchaseMinor" BIGINT;
