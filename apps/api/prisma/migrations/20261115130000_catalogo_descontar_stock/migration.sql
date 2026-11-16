-- Catálogo online (SISTEMA-107): descontar stock al entregar un pedido.
ALTER TABLE "CatalogSettings" ADD COLUMN "deductStockOnDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CatalogOrder" ADD COLUMN "stockDeductedAt" TIMESTAMPTZ(6);
