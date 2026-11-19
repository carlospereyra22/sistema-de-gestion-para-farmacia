-- Acción terapéutica de cada presentación según el padrón (SISTEMA-108).
ALTER TABLE "MedicineCatalogItem" ADD COLUMN "therapeuticAction" TEXT NOT NULL DEFAULT '';
