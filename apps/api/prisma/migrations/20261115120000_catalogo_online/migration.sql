-- CreateEnum
CREATE TYPE "CatalogOrderStatus" AS ENUM ('RECEIVED', 'CONFIRMED', 'REJECTED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CatalogDelivery" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateTable
CREATE TABLE "CatalogSettings" (
    "organizationId" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "branchId" UUID NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "displayName" VARCHAR(80) NOT NULL,
    "requireLogin" BOOLEAN NOT NULL DEFAULT false,
    "showPricesPublic" BOOLEAN NOT NULL DEFAULT true,
    "showOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "priceListId" UUID,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastOrderNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CatalogSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "CatalogPortalUser" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CatalogPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogPortalSession" (
    "id" UUID NOT NULL,
    "portalUserId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "portalUserId" UUID NOT NULL,
    "status" "CatalogOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "delivery" "CatalogDelivery" NOT NULL,
    "deliveryAddress" VARCHAR(200),
    "notes" VARCHAR(500),
    "priceListId" UUID NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "decidedAt" TIMESTAMPTZ(6),
    "decidedById" UUID,
    "decisionNote" VARCHAR(300),
    "deliveredAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CatalogOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogOrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" VARCHAR(200) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,

    CONSTRAINT "CatalogOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSettings_slug_key" ON "CatalogSettings"("slug");

-- CreateIndex
CREATE INDEX "CatalogSettings_branchId_idx" ON "CatalogSettings"("branchId");

-- CreateIndex
CREATE INDEX "CatalogPortalUser_customerId_idx" ON "CatalogPortalUser"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPortalUser_organizationId_email_key" ON "CatalogPortalUser"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPortalUser_id_organizationId_key" ON "CatalogPortalUser"("id", "organizationId");

-- CreateIndex
CREATE INDEX "CatalogPortalSession_portalUserId_revokedAt_idx" ON "CatalogPortalSession"("portalUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "CatalogOrder_organizationId_status_createdAt_idx" ON "CatalogOrder"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogOrder_portalUserId_createdAt_idx" ON "CatalogOrder"("portalUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogOrder_organizationId_number_key" ON "CatalogOrder"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogOrder_organizationId_requestId_key" ON "CatalogOrder"("organizationId", "requestId");

-- CreateIndex
CREATE INDEX "CatalogOrderItem_orderId_idx" ON "CatalogOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "CatalogOrderItem_productId_idx" ON "CatalogOrderItem"("productId");

-- AddForeignKey
ALTER TABLE "CatalogSettings" ADD CONSTRAINT "CatalogSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSettings" ADD CONSTRAINT "CatalogSettings_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSettings" ADD CONSTRAINT "CatalogSettings_priceListId_organizationId_fkey" FOREIGN KEY ("priceListId", "organizationId") REFERENCES "PriceList"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPortalUser" ADD CONSTRAINT "CatalogPortalUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPortalSession" ADD CONSTRAINT "CatalogPortalSession_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "CatalogPortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOrder" ADD CONSTRAINT "CatalogOrder_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOrder" ADD CONSTRAINT "CatalogOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOrder" ADD CONSTRAINT "CatalogOrder_portalUserId_organizationId_fkey" FOREIGN KEY ("portalUserId", "organizationId") REFERENCES "CatalogPortalUser"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOrderItem" ADD CONSTRAINT "CatalogOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CatalogOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOrderItem" ADD CONSTRAINT "CatalogOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Controles que Prisma no expresa (SISTEMA-107).
ALTER TABLE "CatalogSettings" ADD CONSTRAINT "CatalogSettings_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") BETWEEN 3 AND 60);
ALTER TABLE "CatalogSettings" ADD CONSTRAINT "CatalogSettings_delivery_option"
  CHECK ("pickupEnabled" OR "deliveryEnabled");
ALTER TABLE "CatalogOrder" ADD CONSTRAINT "CatalogOrder_total_not_negative"
  CHECK ("totalMinor" >= 0 AND "number" > 0);
ALTER TABLE "CatalogOrderItem" ADD CONSTRAINT "CatalogOrderItem_amounts"
  CHECK ("quantity" > 0 AND "unitPriceMinor" >= 0 AND "totalMinor" = "unitPriceMinor" * "quantity");
