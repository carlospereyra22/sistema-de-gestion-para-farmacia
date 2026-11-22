-- Pedidos del catálogo y de preventa en una sola pantalla (SISTEMA-119).
ALTER TABLE "Organization" ADD COLUMN "unifiedOrders" BOOLEAN NOT NULL DEFAULT false;
