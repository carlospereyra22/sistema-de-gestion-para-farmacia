-- SISTEMA-70: buscar un CUIT en el padrón de ARCA al cargar un cliente. El
-- acceso de ARCA para ese servicio se guarda aparte del de facturación.
ALTER TABLE "FiscalCredential" ADD COLUMN "encryptedPadronTicket" TEXT;
ALTER TABLE "FiscalCredential" ADD COLUMN "padronTicketExpiresAt" TIMESTAMPTZ(6);
