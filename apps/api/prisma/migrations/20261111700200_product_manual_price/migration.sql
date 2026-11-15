-- Precio manual en medicamentos vinculados (SISTEMA-103): la actualización
-- automática conserva la referencia al día pero no cambia este precio.
ALTER TABLE "Product" ADD COLUMN "priceManual" BOOLEAN NOT NULL DEFAULT false;
