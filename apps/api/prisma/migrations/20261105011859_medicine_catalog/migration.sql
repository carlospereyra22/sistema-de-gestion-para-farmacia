-- Base propia de medicamentos (SISTEMA-26). Solo tablas nuevas: no toca datos
-- ni constraints existentes.

-- CreateTable
CREATE TABLE "MedicineCatalogItem" (
    "id" UUID NOT NULL,
    "externalKey" VARCHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "presentation" TEXT NOT NULL DEFAULT '',
    "activeIngredient" TEXT NOT NULL DEFAULT '',
    "laboratory" TEXT NOT NULL DEFAULT '',
    "pharmaceuticalForm" TEXT NOT NULL DEFAULT '',
    "saleCondition" TEXT NOT NULL DEFAULT '',
    "troquel" TEXT NOT NULL DEFAULT '',
    "priceSource" VARCHAR(20) NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "referenceUrl" TEXT,
    "sourceRowKey" TEXT NOT NULL DEFAULT '',
    "officialDelisted" BOOLEAN NOT NULL DEFAULT false,
    "laboratoryMismatch" TEXT,
    "reviewReason" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "priceUpdatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceCheckedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MedicineCatalogItem_pkey" PRIMARY KEY ("id"),
    -- Sin precio no entra a la base: nunca se guarda en cero.
    CONSTRAINT "MedicineCatalogItem_priceMinor_check" CHECK ("priceMinor" > 0),
    CONSTRAINT "MedicineCatalogItem_priceSource_check" CHECK ("priceSource" IN ('official', 'preciosderemedios', 'alfabeta')),
    -- Remedios y AlfaBeta siempre tienen su link exacto.
    CONSTRAINT "MedicineCatalogItem_referenceUrl_check" CHECK ("priceSource" = 'official' OR "referenceUrl" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "MedicineCatalogBarcode" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "barcode" VARCHAR(32) NOT NULL,
    "gtin" VARCHAR(14),

    CONSTRAINT "MedicineCatalogBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineLaboratoryAlias" (
    "catalogName" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL,

    CONSTRAINT "MedicineLaboratoryAlias_pkey" PRIMARY KEY ("catalogName","sourceName"),
    CONSTRAINT "MedicineLaboratoryAlias_status_check" CHECK ("status" IN ('igual', 'parecido', 'duda', 'distinto'))
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicineCatalogItem_externalKey_key" ON "MedicineCatalogItem"("externalKey");

-- CreateIndex
CREATE INDEX "MedicineCatalogItem_priceSource_idx" ON "MedicineCatalogItem"("priceSource");

-- CreateIndex
CREATE INDEX "MedicineCatalogItem_name_idx" ON "MedicineCatalogItem"("name");

-- CreateIndex
CREATE INDEX "MedicineCatalogBarcode_gtin_idx" ON "MedicineCatalogBarcode"("gtin");

-- CreateIndex
CREATE INDEX "MedicineCatalogBarcode_barcode_idx" ON "MedicineCatalogBarcode"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineCatalogBarcode_itemId_barcode_key" ON "MedicineCatalogBarcode"("itemId", "barcode");

-- AddForeignKey
ALTER TABLE "MedicineCatalogBarcode" ADD CONSTRAINT "MedicineCatalogBarcode_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MedicineCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
