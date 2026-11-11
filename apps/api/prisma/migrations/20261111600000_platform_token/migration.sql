-- Acceso al panel de plataforma atado a la pestaña (SISTEMA-94). Reemplaza a
-- AuthSession.platformVerifiedAt como prueba del código: esa columna queda sin
-- uso y se limpia más adelante.
CREATE TABLE "PlatformToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "userAgent" VARCHAR(160),
    "ip" VARCHAR(64),

    CONSTRAINT "PlatformToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformToken_userId_revokedAt_idx" ON "PlatformToken"("userId", "revokedAt");
CREATE INDEX "PlatformToken_sessionId_idx" ON "PlatformToken"("sessionId");

ALTER TABLE "PlatformToken" ADD CONSTRAINT "PlatformToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformToken" ADD CONSTRAINT "PlatformToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
