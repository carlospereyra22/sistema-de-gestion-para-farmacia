-- Foto de tienda puesta sola en productos que coinciden con la base de
-- medicamentos (SISTEMA-122). Columna nueva, vacía: no cambia nada existente.
ALTER TABLE "Product" ADD COLUMN "fotoTiendaEn" TIMESTAMPTZ(6);
