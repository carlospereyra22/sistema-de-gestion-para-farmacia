-- SISTEMA-70: certificado de Farmatec para consultar el padrón de ARCA en
-- nombre de la plataforma, para todas las farmacias (uno por ambiente).
CREATE TABLE "PlatformPadronCredential" (
    "id" UUID NOT NULL,
    "environment" VARCHAR(20) NOT NULL,
    "cuit" VARCHAR(11) NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "csr" TEXT,
    "certificate" TEXT,
    "fingerprint" TEXT,
    "expiresAt" TIMESTAMPTZ(6),
    "encryptedTicket" TEXT,
    "ticketExpiresAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlatformPadronCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformPadronCredential_environment_key" ON "PlatformPadronCredential"("environment");

ALTER TABLE "PlatformPadronCredential" ADD CONSTRAINT "PlatformPadronCredential_environment_check"
  CHECK ("environment" IN ('HOMOLOGATION', 'PRODUCTION'));
ALTER TABLE "PlatformPadronCredential" ADD CONSTRAINT "PlatformPadronCredential_cuit_check"
  CHECK ("cuit" ~ '^[0-9]{11}$');
