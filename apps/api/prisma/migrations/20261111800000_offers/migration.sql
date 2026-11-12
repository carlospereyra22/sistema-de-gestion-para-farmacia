-- Ofertas (SISTEMA-103): promociones de la organización que la venta aplica
-- sola. Migración aditiva: tablas nuevas, una columna con valor por defecto en
-- SaleItem y dos índices únicos (id, organizationId) para las FK compuestas.
-- No cambia ventas, precios ni stock existentes.

CREATE TYPE "OfferType" AS ENUM ('PERCENT', 'AMOUNT_OFF', 'FIXED_PRICE', 'BUY_X_PAY_Y', 'NTH_UNIT_PERCENT', 'TIERED', 'BUNDLE');

CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'FINISHED', 'ARCHIVED');

CREATE TYPE "OfferProductKind" AS ENUM ('ALL', 'MEDICATION', 'NON_MEDICATION');

CREATE TYPE "OfferTargetKind" AS ENUM ('PRODUCT', 'CATEGORY', 'LABORATORY');

ALTER TABLE "SaleItem" ADD COLUMN     "offerDiscountMinor" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "OfferType" NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "combinable" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6),
    "weekdays" INTEGER,
    "dayStartMinute" INTEGER,
    "dayEndMinute" INTEGER,
    "allBranches" BOOLEAN NOT NULL DEFAULT true,
    "allPriceLists" BOOLEAN NOT NULL DEFAULT true,
    "productKind" "OfferProductKind" NOT NULL DEFAULT 'ALL',
    "maxUnitsPerSale" INTEGER,
    "maxUnitsTotal" INTEGER,
    "percentBps" INTEGER,
    "amountMinor" BIGINT,
    "fixedPriceMinor" BIGINT,
    "buyQuantity" INTEGER,
    "payQuantity" INTEGER,
    "nthUnit" INTEGER,
    "bundlePriceMinor" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "pausedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfferTier" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "percentBps" INTEGER,
    "amountMinor" BIGINT,

    CONSTRAINT "OfferTier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfferTarget" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "OfferTargetKind" NOT NULL,
    "productId" UUID,
    "categoryId" UUID,
    "laboratoryId" UUID,
    "exclude" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER,

    CONSTRAINT "OfferTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfferBranch" (
    "offerId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,

    CONSTRAINT "OfferBranch_pkey" PRIMARY KEY ("offerId","branchId")
);

CREATE TABLE "OfferPriceList" (
    "offerId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,

    CONSTRAINT "OfferPriceList_pkey" PRIMARY KEY ("offerId","priceListId")
);

CREATE TABLE "SaleOffer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "offerVersion" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "type" "OfferType" NOT NULL,
    "parameters" JSONB NOT NULL,
    "units" INTEGER NOT NULL,
    "discountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleOfferItem" (
    "id" UUID NOT NULL,
    "saleOfferId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "units" INTEGER NOT NULL,
    "grossMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL,

    CONSTRAINT "SaleOfferItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Offer_organizationId_status_idx" ON "Offer"("organizationId", "status");

CREATE UNIQUE INDEX "Offer_id_organizationId_key" ON "Offer"("id", "organizationId");

CREATE UNIQUE INDEX "OfferTier_offerId_minQuantity_key" ON "OfferTier"("offerId", "minQuantity");

CREATE INDEX "OfferTarget_offerId_idx" ON "OfferTarget"("offerId");

CREATE INDEX "OfferTarget_productId_idx" ON "OfferTarget"("productId");

CREATE INDEX "OfferTarget_categoryId_idx" ON "OfferTarget"("categoryId");

CREATE INDEX "OfferTarget_laboratoryId_idx" ON "OfferTarget"("laboratoryId");

CREATE INDEX "OfferBranch_branchId_idx" ON "OfferBranch"("branchId");

CREATE INDEX "OfferPriceList_priceListId_idx" ON "OfferPriceList"("priceListId");

CREATE INDEX "SaleOffer_organizationId_offerId_createdAt_idx" ON "SaleOffer"("organizationId", "offerId", "createdAt");

CREATE INDEX "SaleOffer_saleId_idx" ON "SaleOffer"("saleId");

CREATE INDEX "SaleOfferItem_saleOfferId_idx" ON "SaleOfferItem"("saleOfferId");

CREATE INDEX "SaleOfferItem_productId_idx" ON "SaleOfferItem"("productId");

CREATE UNIQUE INDEX "Laboratory_id_organizationId_key" ON "Laboratory"("id", "organizationId");

CREATE UNIQUE INDEX "PriceList_id_organizationId_key" ON "PriceList"("id", "organizationId");

ALTER TABLE "OfferTier" ADD CONSTRAINT "OfferTier_offerId_organizationId_fkey" FOREIGN KEY ("offerId", "organizationId") REFERENCES "Offer"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferTarget" ADD CONSTRAINT "OfferTarget_offerId_organizationId_fkey" FOREIGN KEY ("offerId", "organizationId") REFERENCES "Offer"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferTarget" ADD CONSTRAINT "OfferTarget_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OfferTarget" ADD CONSTRAINT "OfferTarget_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "Category"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OfferTarget" ADD CONSTRAINT "OfferTarget_laboratoryId_organizationId_fkey" FOREIGN KEY ("laboratoryId", "organizationId") REFERENCES "Laboratory"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OfferBranch" ADD CONSTRAINT "OfferBranch_offerId_organizationId_fkey" FOREIGN KEY ("offerId", "organizationId") REFERENCES "Offer"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferBranch" ADD CONSTRAINT "OfferBranch_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OfferPriceList" ADD CONSTRAINT "OfferPriceList_offerId_organizationId_fkey" FOREIGN KEY ("offerId", "organizationId") REFERENCES "Offer"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferPriceList" ADD CONSTRAINT "OfferPriceList_priceListId_organizationId_fkey" FOREIGN KEY ("priceListId", "organizationId") REFERENCES "PriceList"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleOffer" ADD CONSTRAINT "SaleOffer_saleId_organizationId_fkey" FOREIGN KEY ("saleId", "organizationId") REFERENCES "Sale"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleOffer" ADD CONSTRAINT "SaleOffer_offerId_organizationId_fkey" FOREIGN KEY ("offerId", "organizationId") REFERENCES "Offer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleOfferItem" ADD CONSTRAINT "SaleOfferItem_saleOfferId_fkey" FOREIGN KEY ("saleOfferId") REFERENCES "SaleOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Parámetros tipados: cada tipo exige los suyos y deja en nulo los demás.
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
    ELSE false
  END
);

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_schedule" CHECK (
  ("endsAt" IS NULL OR "endsAt" > "startsAt")
  AND ("weekdays" IS NULL OR "weekdays" BETWEEN 1 AND 127)
  AND (("dayStartMinute" IS NULL AND "dayEndMinute" IS NULL)
    OR ("dayStartMinute" BETWEEN 0 AND 1439 AND "dayEndMinute" BETWEEN 1 AND 1440
      AND "dayStartMinute" < "dayEndMinute"))
  AND ("maxUnitsPerSale" IS NULL OR "maxUnitsPerSale" > 0)
  AND ("maxUnitsTotal" IS NULL OR "maxUnitsTotal" > 0)
  AND "version" >= 1
  AND char_length(btrim("name")) BETWEEN 3 AND 120
);

ALTER TABLE "OfferTier" ADD CONSTRAINT "OfferTier_benefit" CHECK (
  "minQuantity" BETWEEN 2 AND 1000
  AND (("percentBps" BETWEEN 1 AND 10000 AND "amountMinor" IS NULL)
    OR ("percentBps" IS NULL AND "amountMinor" > 0))
);

-- Cada destino apunta sólo a lo que dice su tipo.
ALTER TABLE "OfferTarget" ADD CONSTRAINT "OfferTarget_kind" CHECK (
  CASE "kind"
    WHEN 'PRODUCT' THEN "productId" IS NOT NULL AND "categoryId" IS NULL AND "laboratoryId" IS NULL
    WHEN 'CATEGORY' THEN "categoryId" IS NOT NULL AND "productId" IS NULL AND "laboratoryId" IS NULL
    WHEN 'LABORATORY' THEN "laboratoryId" IS NOT NULL AND "productId" IS NULL AND "categoryId" IS NULL
    ELSE false
  END
  AND ("quantity" IS NULL OR ("quantity" BETWEEN 1 AND 1000 AND "kind" = 'PRODUCT' AND NOT "exclude"))
);

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_offer_discount" CHECK (
  "offerDiscountMinor" >= 0 AND "offerDiscountMinor" <= "discountMinor"
);

ALTER TABLE "SaleOffer" ADD CONSTRAINT "SaleOffer_amounts" CHECK (
  "units" > 0 AND "discountMinor" >= 0 AND "offerVersion" >= 1
);

ALTER TABLE "SaleOfferItem" ADD CONSTRAINT "SaleOfferItem_amounts" CHECK (
  "units" > 0 AND "grossMinor" >= 0 AND "discountMinor" >= 0 AND "discountMinor" <= "grossMinor"
);

-- Avisos de ventas sin conexión con ofertas.
ALTER TABLE "OfflineSyncIssue" DROP CONSTRAINT "OfflineSyncIssue_kind_check";
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_kind_check" CHECK ("kind" IN (
  'PRECIO_DISTINTO', 'STOCK_FALTANTE', 'PRODUCTO_NO_DISPONIBLE',
  'CLIENTE_INACTIVO', 'LISTA_INACTIVA', 'LIMITE_CREDITO', 'CAJA_CERRADA',
  'FACTURA_NO_PREPARADA', 'MOVIMIENTO_RETENIDO', 'EGRESO_SUPERA_EFECTIVO',
  'SALDO_A_FAVOR', 'CAJA_YA_ABIERTA', 'OTRA_CAJA_ABIERTA', 'CIERRE_DISTINTO',
  'SALDO_DISTINTO', 'CONFIGURACION_PISADA', 'CLIENTE_DUPLICADO',
  'TRANSFERENCIA_YA_DESPACHADA', 'TRANSFERENCIA_YA_RECIBIDA',
  'PROVEEDOR_INACTIVO', 'COMPROBANTE_REPETIDO', 'PAGO_SUPERA_SALDO',
  'PAGO_YA_ANULADO',
  'CODIGO_REPETIDO', 'DATO_PISADO', 'AJUSTE_SUPERA_STOCK', 'LOTE_REPETIDO',
  'OPCION_EXISTENTE', 'PRODUCTO_INACTIVO',
  'NOMBRE_REPETIDO',
  'COBRO_YA_ASIGNADO',
  'OFERTA_DISTINTA', 'TOPE_OFERTA_SUPERADO'
));

-- Permisos de ofertas. Los reciben los roles que ya administran o consultan el
-- catálogo; el alta de farmacias nuevas los incluye desde organization-provisioning.
INSERT INTO "Permission" ("id","code","description") VALUES
 (gen_random_uuid(),'OFFER_READ','Ver ofertas'),
 (gen_random_uuid(),'OFFER_MANAGE','Crear y editar ofertas')
 ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT existing."roleId", granted.id
 FROM "RolePermission" existing
 JOIN "Permission" source ON source.id = existing."permissionId"
 JOIN "Permission" granted ON granted.code = 'OFFER_READ'
 WHERE source.code = 'CATALOG_READ'
 ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT existing."roleId", granted.id
 FROM "RolePermission" existing
 JOIN "Permission" source ON source.id = existing."permissionId"
 JOIN "Permission" granted ON granted.code = 'OFFER_MANAGE'
 WHERE source.code = 'CATALOG_MANAGE'
 ON CONFLICT DO NOTHING;
