-- Vencimiento por inactividad, rotación de la clave y datos para reconocer la
-- sesión (SISTEMA-93). Las sesiones existentes quedan con lastUsedAt = momento
-- de la migración: nadie se queda afuera al publicar.
ALTER TABLE "AuthSession"
  ADD COLUMN "lastUsedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "previousTokenHash" TEXT,
  ADD COLUMN "previousTokenValidUntil" TIMESTAMPTZ(6),
  ADD COLUMN "retiredTokenHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "userAgent" VARCHAR(160),
  ADD COLUMN "ip" VARCHAR(64),
  ADD COLUMN "deviceId" UUID,
  ADD COLUMN "soporte" BOOLEAN NOT NULL DEFAULT false;

-- Las únicas sesiones vigentes con vencimiento fijo son las de soporte
-- (SISTEMA-89, tope de 7 días): no se le muestran a la farmacia.
UPDATE "AuthSession"
SET "soporte" = true
WHERE "revokedAt" IS NULL AND "expiresAt" IS NOT NULL AND "expiresAt" > CURRENT_TIMESTAMP;

CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
