-- Catálogo online (SISTEMA-107): módulo por farmacia, apagado por defecto.
-- Lo habilita el superadmin desde el panel de plataforma.
ALTER TABLE "Organization" ADD COLUMN "catalogEnabled" BOOLEAN NOT NULL DEFAULT false;
