-- Preventa (SISTEMA-108): pedidos del preventista, reparto, cobros y comisiones.
-- Módulo por farmacia (Organization.preventaEnabled), apagado por defecto.

-- CreateEnum
CREATE TYPE "PreventaOrderStatus" AS ENUM ('PENDING', 'IN_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PreventaDeliveryEffect" AS ENUM ('NONE', 'STOCK', 'SALE');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "preventaEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PreventaSettings" (
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "deliveryEffect" "PreventaDeliveryEffect" NOT NULL DEFAULT 'NONE',
    "sellerCanChangePrice" BOOLEAN NOT NULL DEFAULT false,
    "sellerSeesAllCustomers" BOOLEAN NOT NULL DEFAULT true,
    "showStock" BOOLEAN NOT NULL DEFAULT true,
    "allowOutOfStock" BOOLEAN NOT NULL DEFAULT true,
    "applyOffers" BOOLEAN NOT NULL DEFAULT true,
    "receiptNote" VARCHAR(300),
    "lastOrderNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PreventaSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "PreventaSeller" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "commissionRateBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PreventaSeller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventaCustomer" (
    "customerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sellerId" UUID,
    "address" VARCHAR(200),
    "reference" VARCHAR(300),
    "phone" VARCHAR(40),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "visitDays" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PreventaCustomer_pkey" PRIMARY KEY ("customerId")
);

-- CreateTable
CREATE TABLE "PreventaOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "status" "PreventaOrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes" VARCHAR(500),
    "deliveryAddress" VARCHAR(200),
    "totalMinor" BIGINT NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "delivererId" UUID,
    "assignedAt" TIMESTAMPTZ(6),
    "deliveryNote" VARCHAR(300),
    "deliveredAt" TIMESTAMPTZ(6),
    "deliveredById" UUID,
    "deliveryEffect" "PreventaDeliveryEffect",
    "saleId" UUID,
    "stockDeductedAt" TIMESTAMPTZ(6),
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelledById" UUID,
    "cancelReason" VARCHAR(300),
    "commissionRateBps" INTEGER,
    "commissionPaymentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PreventaOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventaOrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" VARCHAR(200) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "listUnitPriceMinor" BIGINT NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,

    CONSTRAINT "PreventaOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventaOrderOffer" (
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

    CONSTRAINT "PreventaOrderOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventaOrderOfferItem" (
    "id" UUID NOT NULL,
    "orderOfferId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "units" INTEGER NOT NULL,
    "grossMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL,

    CONSTRAINT "PreventaOrderOfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventaPayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "actorId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreventaPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventaCommissionPayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "note" VARCHAR(300),
    "actorId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreventaCommissionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreventaSettings_branchId_idx" ON "PreventaSettings"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PreventaSeller_organizationId_userId_key" ON "PreventaSeller"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "PreventaCustomer_organizationId_sellerId_idx" ON "PreventaCustomer"("organizationId", "sellerId");

-- CreateIndex
CREATE INDEX "PreventaOrder_organizationId_status_createdAt_idx" ON "PreventaOrder"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PreventaOrder_organizationId_sellerId_createdAt_idx" ON "PreventaOrder"("organizationId", "sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "PreventaOrder_organizationId_delivererId_status_idx" ON "PreventaOrder"("organizationId", "delivererId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PreventaOrder_id_organizationId_key" ON "PreventaOrder"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PreventaOrder_organizationId_number_key" ON "PreventaOrder"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PreventaOrder_organizationId_requestId_key" ON "PreventaOrder"("organizationId", "requestId");

-- CreateIndex
CREATE INDEX "PreventaOrderItem_orderId_idx" ON "PreventaOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "PreventaOrderItem_productId_idx" ON "PreventaOrderItem"("productId");

-- CreateIndex
CREATE INDEX "PreventaOrderOffer_organizationId_offerId_createdAt_idx" ON "PreventaOrderOffer"("organizationId", "offerId", "createdAt");

-- CreateIndex
CREATE INDEX "PreventaOrderOffer_orderId_idx" ON "PreventaOrderOffer"("orderId");

-- CreateIndex
CREATE INDEX "PreventaOrderOfferItem_orderOfferId_idx" ON "PreventaOrderOfferItem"("orderOfferId");

-- CreateIndex
CREATE INDEX "PreventaPayment_orderId_idx" ON "PreventaPayment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PreventaPayment_organizationId_requestId_key" ON "PreventaPayment"("organizationId", "requestId");

-- CreateIndex
CREATE INDEX "PreventaCommissionPayment_organizationId_sellerId_createdAt_idx" ON "PreventaCommissionPayment"("organizationId", "sellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PreventaCommissionPayment_organizationId_requestId_key" ON "PreventaCommissionPayment"("organizationId", "requestId");

-- AddForeignKey
ALTER TABLE "PreventaSettings" ADD CONSTRAINT "PreventaSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaSettings" ADD CONSTRAINT "PreventaSettings_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaSeller" ADD CONSTRAINT "PreventaSeller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaCustomer" ADD CONSTRAINT "PreventaCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaCustomer" ADD CONSTRAINT "PreventaCustomer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrder" ADD CONSTRAINT "PreventaOrder_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrder" ADD CONSTRAINT "PreventaOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrder" ADD CONSTRAINT "PreventaOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrder" ADD CONSTRAINT "PreventaOrder_delivererId_fkey" FOREIGN KEY ("delivererId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrder" ADD CONSTRAINT "PreventaOrder_commissionPaymentId_fkey" FOREIGN KEY ("commissionPaymentId") REFERENCES "PreventaCommissionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrderItem" ADD CONSTRAINT "PreventaOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PreventaOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrderItem" ADD CONSTRAINT "PreventaOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrderOffer" ADD CONSTRAINT "PreventaOrderOffer_orderId_organizationId_fkey" FOREIGN KEY ("orderId", "organizationId") REFERENCES "PreventaOrder"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrderOffer" ADD CONSTRAINT "PreventaOrderOffer_offerId_organizationId_fkey" FOREIGN KEY ("offerId", "organizationId") REFERENCES "Offer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaOrderOfferItem" ADD CONSTRAINT "PreventaOrderOfferItem_orderOfferId_fkey" FOREIGN KEY ("orderOfferId") REFERENCES "PreventaOrderOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventaPayment" ADD CONSTRAINT "PreventaPayment_orderId_organizationId_fkey" FOREIGN KEY ("orderId", "organizationId") REFERENCES "PreventaOrder"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integridad que Prisma no expresa.
ALTER TABLE "PreventaOrderItem" ADD CONSTRAINT "PreventaOrderItem_valores_check"
  CHECK ("quantity" > 0 AND "listUnitPriceMinor" >= 0 AND "unitPriceMinor" >= 0
    AND "unitPriceMinor" <= "listUnitPriceMinor" AND "discountMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "PreventaOrder" ADD CONSTRAINT "PreventaOrder_importes_check"
  CHECK ("totalMinor" >= 0 AND "paidMinor" >= 0
    AND ("commissionRateBps" IS NULL OR "commissionRateBps" BETWEEN 0 AND 10000));
ALTER TABLE "PreventaPayment" ADD CONSTRAINT "PreventaPayment_importe_check" CHECK ("amountMinor" > 0);
ALTER TABLE "PreventaSeller" ADD CONSTRAINT "PreventaSeller_comision_check"
  CHECK ("commissionRateBps" BETWEEN 0 AND 10000);
ALTER TABLE "PreventaCustomer" ADD CONSTRAINT "PreventaCustomer_dias_check"
  CHECK ("visitDays" BETWEEN 0 AND 127
    AND ("latitude" IS NULL) = ("longitude" IS NULL));
ALTER TABLE "PreventaCommissionPayment" ADD CONSTRAINT "PreventaCommissionPayment_importe_check"
  CHECK ("amountMinor" >= 0 AND "orderCount" > 0);

-- Permisos de preventa. Administrarla lo reciben los roles que ya administran la
-- farmacia; los roles Preventista y Repartidor se crean al habilitar el módulo.
INSERT INTO "Permission" ("id","code","description") VALUES
 (gen_random_uuid(),'PREVENTA_SELL','Tomar pedidos de preventa'),
 (gen_random_uuid(),'PREVENTA_DELIVER','Repartir pedidos de preventa'),
 (gen_random_uuid(),'PREVENTA_MANAGE','Administrar la preventa')
 ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT existing."roleId", granted.id
 FROM "RolePermission" existing
 JOIN "Permission" source ON source.id = existing."permissionId"
 JOIN "Permission" granted ON granted.code = 'PREVENTA_MANAGE'
 WHERE source.code = 'ORGANIZATION_MANAGE'
 ON CONFLICT DO NOTHING;
