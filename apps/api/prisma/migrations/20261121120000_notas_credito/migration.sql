-- SISTEMA-110: notas de crédito por la venta entera o por productos.
--
-- La nota de crédito es una devolución comercial (CustomerReturn) que además
-- devuelve plata y, si se elige, repone stock. Las devoluciones anteriores
-- quedan con estas columnas en NULL / false y conservan su comportamiento.
--   creditKind INTERNA: venta con comprobante interno (nota de crédito interna).
--   creditKind FACTURA: venta facturada; lleva una nota de crédito C (13) en
--   FiscalDocument (producción) o en FiscalTrial (homologación).

ALTER TABLE "CustomerReturn"
  ADD COLUMN "requestId" UUID,
  ADD COLUMN "creditKind" VARCHAR(20),
  ADD COLUMN "totalMinor" BIGINT,
  ADD COLUMN "accountMinor" BIGINT,
  ADD COLUMN "refundMinor" BIGINT,
  ADD COLUMN "refundMethod" "PaymentMethod",
  ADD COLUMN "cashSessionId" UUID;

CREATE UNIQUE INDEX "CustomerReturn_organizationId_requestId_key"
  ON "CustomerReturn"("organizationId", "requestId");

-- Una nota de crédito tiene solicitud, total positivo y lo acreditado se reparte
-- entre cuenta corriente y plata devuelta. El efectivo devuelto sale de una caja.
ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_nota_credito_check" CHECK (
  "creditKind" IS NULL OR (
    "creditKind" IN ('INTERNA', 'FACTURA')
    AND "requestId" IS NOT NULL
    AND "totalMinor" > 0
    AND "accountMinor" >= 0
    AND "refundMinor" >= 0
    AND "accountMinor" + "refundMinor" = "totalMinor"
    AND ("refundMinor" = 0 OR "refundMethod" IN ('CASH', 'CARD', 'TRANSFER'))
    AND ("refundMethod" IS DISTINCT FROM 'CASH' OR "refundMinor" = 0 OR "cashSessionId" IS NOT NULL)
  )
);

ALTER TABLE "CustomerReturnItem"
  ADD COLUMN "amountMinor" BIGINT,
  ADD COLUMN "restocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerReturnItem" ADD CONSTRAINT "CustomerReturnItem_amount_check"
  CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0);

ALTER TABLE "FiscalDocument" ADD COLUMN "customerReturnId" UUID;

-- Notas de crédito de prueba: van en filas propias de FiscalTrial. sourceSaleId
-- sigue siendo de la factura (una por venta); la nota usa creditSaleId.
ALTER TABLE "FiscalTrial"
  ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN "originalId" UUID,
  ADD COLUMN "creditSaleId" UUID,
  ADD COLUMN "customerReturnId" UUID,
  ADD COLUMN "reason" TEXT;

CREATE INDEX "FiscalTrial_creditSaleId_idx" ON "FiscalTrial"("creditSaleId");
CREATE INDEX "FiscalTrial_originalId_idx" ON "FiscalTrial"("originalId");

ALTER TABLE "FiscalTrial" DROP CONSTRAINT "FiscalTrial_values";
ALTER TABLE "FiscalTrial" ADD CONSTRAINT "FiscalTrial_values"
  CHECK ("point" BETWEEN 1 AND 99999 AND "voucherType" IN (6, 11, 13) AND "totalMinor" > 0);
ALTER TABLE "FiscalTrial" ADD CONSTRAINT "FiscalTrial_kind_check" CHECK (
  ("kind" = 'INVOICE' AND "voucherType" IN (6, 11) AND "originalId" IS NULL AND "creditSaleId" IS NULL)
  OR ("kind" = 'CREDIT_NOTE' AND "voucherType" = 13 AND "originalId" IS NOT NULL
      AND "creditSaleId" IS NOT NULL AND "sourceSaleId" IS NULL)
);
