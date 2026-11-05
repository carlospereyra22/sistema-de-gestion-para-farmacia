-- Exhibidores de droguería (SISTEMA-26): un código que equivale a N unidades de
-- otro. Solo tabla nueva.

-- CreateTable
CREATE TABLE "MedicineCatalogPack" (
    "barcode" VARCHAR(32) NOT NULL,
    "baseBarcode" VARCHAR(32) NOT NULL,
    "factor" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MedicineCatalogPack_pkey" PRIMARY KEY ("barcode"),
    CONSTRAINT "MedicineCatalogPack_factor_check" CHECK ("factor" BETWEEN 2 AND 1000),
    CONSTRAINT "MedicineCatalogPack_base_check" CHECK ("barcode" <> "baseBarcode")
);
