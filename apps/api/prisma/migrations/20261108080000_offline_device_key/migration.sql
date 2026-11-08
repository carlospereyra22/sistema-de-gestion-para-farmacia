-- SISTEMA-66: clave pública con la que cada PC firma las ventas sin conexión de
-- un usuario. Al volver la conexión, otro usuario de la misma PC puede mandar
-- esas ventas y el servidor las registra a nombre de quien las hizo, después de
-- verificar la firma con esta clave (ECDSA P-256, SPKI en base64).
CREATE TABLE "OfflineDeviceKey" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OfflineDeviceKey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OfflineDeviceKey_publicKey_check" CHECK (length("publicKey") BETWEEN 80 AND 500)
);

CREATE UNIQUE INDEX "OfflineDeviceKey_userId_deviceId_key" ON "OfflineDeviceKey"("userId", "deviceId");

ALTER TABLE "OfflineDeviceKey" ADD CONSTRAINT "OfflineDeviceKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
