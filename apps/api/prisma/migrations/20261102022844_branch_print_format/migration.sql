-- Formato de impresión por sucursal (SISTEMA-17). NULL = usa el predeterminado de
-- la organización (Organization.documentTemplate.defaultFormat). Aditivo.
ALTER TABLE "Branch" ADD COLUMN "printFormat" VARCHAR(10);
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_printFormat_check"
  CHECK ("printFormat" IS NULL OR "printFormat" IN ('TICKET', 'A4'));
