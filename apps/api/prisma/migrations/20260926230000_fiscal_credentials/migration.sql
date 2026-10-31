CREATE TABLE "FiscalCredential" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "environment" VARCHAR(20) NOT NULL DEFAULT 'HOMOLOGATION',
  "representedCuit" VARCHAR(11) NOT NULL,
  "holderCuit" VARCHAR(11) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "encryptedPrivateKey" TEXT NOT NULL,
  "csr" TEXT,
  "certificate" TEXT,
  "fingerprint" TEXT,
  "expiresAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "FiscalCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FiscalCredential_environment_check" CHECK ("environment" = 'HOMOLOGATION'),
  CONSTRAINT "FiscalCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalCredential_organizationId_environment_key" ON "FiscalCredential"("organizationId", "environment");
