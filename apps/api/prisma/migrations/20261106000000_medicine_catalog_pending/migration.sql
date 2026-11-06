-- Productos sin precio ni link confiable, guardados hasta conseguirlos (SISTEMA-35).
-- Tabla nueva: no modifica datos existentes.
CREATE TABLE "MedicineCatalogPending" (
    "externalKey" VARCHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "presentation" TEXT NOT NULL DEFAULT '',
    "activeIngredient" TEXT NOT NULL DEFAULT '',
    "laboratory" TEXT NOT NULL DEFAULT '',
    "pharmaceuticalForm" TEXT NOT NULL DEFAULT '',
    "saleCondition" TEXT NOT NULL DEFAULT '',
    "barcodes" TEXT[],
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineCatalogPending_pkey" PRIMARY KEY ("externalKey")
);
