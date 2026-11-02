-- Comprobante A4 por organización (SISTEMA-17): logo a color JPEG y opciones de
-- plantilla. Aditivo y nullable: las organizaciones existentes no cambian.
-- Prisma también proponía recrear FKs y renombrar constraints escritas a mano en
-- migraciones anteriores; se descartó a propósito, no forma parte de este cambio.
ALTER TABLE "Organization" ADD COLUMN "documentLogo" BYTEA,
ADD COLUMN "documentLogoUpdatedAt" TIMESTAMPTZ(6),
ADD COLUMN "documentTemplate" JSONB;
