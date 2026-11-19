-- Dosis de la marca cuando el padrón no la escribe, con su fuente (SISTEMA-108).
ALTER TABLE "MedicineCatalogItem" ADD COLUMN "doseText" VARCHAR(60) NOT NULL DEFAULT '';
ALTER TABLE "MedicineCatalogItem" ADD COLUMN "doseSource" VARCHAR(20) NOT NULL DEFAULT '';
