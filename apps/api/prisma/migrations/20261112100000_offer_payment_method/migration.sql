-- Ofertas por medio de pago (SISTEMA-103). El valor nuevo del enum se usa en
-- la migración siguiente: Postgres no deja usarlo en la misma transacción.
ALTER TYPE "OfferType" ADD VALUE 'PAYMENT_METHOD';

ALTER TABLE "Offer" ADD COLUMN "paymentMethods" "PaymentMethod"[] NOT NULL DEFAULT ARRAY[]::"PaymentMethod"[];

-- Ofertas para todos los productos (con exclusiones).
ALTER TABLE "Offer" ADD COLUMN "allProducts" BOOLEAN NOT NULL DEFAULT false;
