-- Principio activo del padrón para cada medicamento de la base (SISTEMA-108):
-- vincula la guía por CLAVE o código, sin depender del texto de otras fuentes.
ALTER TABLE "MedicineCatalogItem" ADD COLUMN "guideKey" VARCHAR(200) NOT NULL DEFAULT '';
