-- Fichas publicadas de cada marca (SISTEMA-123): prospecto y composición,
-- compartidas por todas las organizaciones. Tabla y columna nuevas; no cambia
-- nada existente.
CREATE TABLE "MedicineMonograph" (
    "id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "laboratory" TEXT NOT NULL DEFAULT '',
    "therapeuticAction" TEXT NOT NULL DEFAULT '',
    "composition" TEXT NOT NULL DEFAULT '',
    "indications" TEXT NOT NULL DEFAULT '',
    "dosage" TEXT NOT NULL DEFAULT '',
    "presentations" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MedicineMonograph_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicineMonograph_source_sourceId_key" ON "MedicineMonograph"("source", "sourceId");
CREATE INDEX "MedicineMonograph_name_idx" ON "MedicineMonograph"("name");

ALTER TABLE "MedicineCatalogItem" ADD COLUMN "monographId" UUID;
CREATE INDEX "MedicineCatalogItem_monographId_idx" ON "MedicineCatalogItem"("monographId");
ALTER TABLE "MedicineCatalogItem" ADD CONSTRAINT "MedicineCatalogItem_monographId_fkey" FOREIGN KEY ("monographId") REFERENCES "MedicineMonograph"("id") ON DELETE SET NULL ON UPDATE CASCADE;
