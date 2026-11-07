-- Aditiva: ningún usuario existente queda obligado a cambiar su contraseña.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
