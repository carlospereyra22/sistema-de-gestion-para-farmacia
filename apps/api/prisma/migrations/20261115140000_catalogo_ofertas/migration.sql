-- Ofertas en el catálogo online (SISTEMA-107). Aditiva: las ofertas existentes quedan
-- en mostrador (POS) y Ventas no cambia.

-- CreateEnum
CREATE TYPE "OfferChannel" AS ENUM ('POS', 'CATALOG', 'BOTH');

-- AlterTable
ALTER TABLE "CatalogOrderItem" ADD COLUMN     "discountMinor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "channel" "OfferChannel" NOT NULL DEFAULT 'POS';

-- CreateTable
CREATE TABLE "CatalogOrderOffer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "offerVersion" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "type" "OfferType" NOT NULL,
    "parameters" JSONB NOT NULL,
    "units" INTEGER NOT NULL,
    "discountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogOrderOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogOrderOfferItem" (
    "id" UUID NOT NULL,
    "orderOfferId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "units" INTEGER NOT NULL,
    "grossMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL,

    CONSTRAINT "CatalogOrderOfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogOrderOffer_organizationId_offerId_createdAt_idx" ON "CatalogOrderOffer"("organizationId", "offerId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogOrderOffer_orderId_idx" ON "CatalogOrderOffer"("orderId");

-- CreateIndex
CREATE INDEX "CatalogOrderOfferItem_orderOfferId_idx" ON "CatalogOrderOfferItem"("orderOfferId");

-- CreateIndex
CREATE INDEX "CatalogOrderOfferItem_productId_idx" ON "CatalogOrderOfferItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogOrder_id_organizationId_key" ON "CatalogOrder"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "CatalogOrderOffer" ADD CONSTRAINT "CatalogOrderOffer_orderId_organizationId_fkey" FOREIGN KEY ("orderId", "organizationId") REFERENCES "CatalogOrder"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOrderOffer" ADD CONSTRAINT "CatalogOrderOffer_offerId_organizationId_fkey" FOREIGN KEY ("offerId", "organizationId") REFERENCES "Offer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOrderOfferItem" ADD CONSTRAINT "CatalogOrderOfferItem_orderOfferId_fkey" FOREIGN KEY ("orderOfferId") REFERENCES "CatalogOrderOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Controles que Prisma no expresa.
-- El total del renglón ya resta el descuento de ofertas.
ALTER TABLE "CatalogOrderItem" DROP CONSTRAINT "CatalogOrderItem_amounts";
ALTER TABLE "CatalogOrderItem" ADD CONSTRAINT "CatalogOrderItem_amounts"
  CHECK ("quantity" > 0 AND "unitPriceMinor" >= 0 AND "discountMinor" >= 0
    AND "discountMinor" <= "unitPriceMinor" * "quantity"
    AND "totalMinor" = "unitPriceMinor" * "quantity" - "discountMinor");
ALTER TABLE "CatalogOrderOfferItem" ADD CONSTRAINT "CatalogOrderOfferItem_amounts"
  CHECK ("units" > 0 AND "discountMinor" >= 0 AND "discountMinor" <= "grossMinor");
ALTER TABLE "CatalogOrderOffer" ADD CONSTRAINT "CatalogOrderOffer_amounts"
  CHECK ("units" > 0 AND "discountMinor" >= 0);
-- En el catálogo no se cobra: la oferta por medio de pago es sólo de mostrador.
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_channel_payment"
  CHECK ("type" <> 'PAYMENT_METHOD' OR "channel" = 'POS');
