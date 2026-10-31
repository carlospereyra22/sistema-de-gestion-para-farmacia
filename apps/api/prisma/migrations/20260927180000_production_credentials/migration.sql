-- Preparation only: production credentials are isolated from homologation.
-- FiscalTrial and FiscalPoint remain HOMOLOGATION-only; no production issuance.
ALTER TABLE "FiscalCredential" DROP CONSTRAINT "FiscalCredential_environment_check";
ALTER TABLE "FiscalCredential" ADD CONSTRAINT "FiscalCredential_environment_check"
  CHECK ("environment" IN ('HOMOLOGATION', 'PRODUCTION'));
