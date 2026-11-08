-- SISTEMA-65: facturas que se emiten después de la venta.
--
-- HELD: factura de una venta cobrada sin caja abierta. Espera a que el cobro se
-- incorpore a una caja; la cola fiscal no la toma y nunca llega a ARCA antes.
-- deferredReason: por qué se facturó después de la venta (NULL: en el momento).
--   CAJA_CERRADA: se pidió factura con la caja cerrada.
--   COMPROBANTE_INTERNO: la venta se hizo con comprobante interno y después se
--   mandó a ARCA a mano.
-- releasedAt: cuándo pasó de HELD a la cola, al incorporar el cobro.

ALTER TABLE "FiscalDocument" DROP CONSTRAINT "FiscalDocument_status_check";
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_status_check"
  CHECK ("status" IN ('HELD','QUEUED','PENDING','UNCERTAIN','AUTHORIZED','REJECTED'));

ALTER TABLE "FiscalTrial" DROP CONSTRAINT "FiscalTrial_status";
ALTER TABLE "FiscalTrial" ADD CONSTRAINT "FiscalTrial_status"
  CHECK ("status" IN ('HELD','QUEUED','PENDING','AUTHORIZED','REJECTED','UNCERTAIN'));

ALTER TABLE "FiscalDocument"
  ADD COLUMN "deferredReason" VARCHAR(20),
  ADD COLUMN "releasedAt" TIMESTAMPTZ(6);
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_deferred_check"
  CHECK ("deferredReason" IS NULL OR ("kind" = 'INVOICE' AND "deferredReason" IN ('CAJA_CERRADA','COMPROBANTE_INTERNO')));
-- Sólo una factura diferida puede esperar, y mientras espera no tiene número.
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_held_check"
  CHECK ("status" <> 'HELD' OR ("deferredReason" IS NOT NULL AND "number" IS NULL));

ALTER TABLE "FiscalTrial"
  ADD COLUMN "deferredReason" VARCHAR(20),
  ADD COLUMN "releasedAt" TIMESTAMPTZ(6);
ALTER TABLE "FiscalTrial" ADD CONSTRAINT "FiscalTrial_deferred_check"
  CHECK ("deferredReason" IS NULL OR ("sourceSaleId" IS NOT NULL AND "deferredReason" IN ('CAJA_CERRADA','COMPROBANTE_INTERNO')));
ALTER TABLE "FiscalTrial" ADD CONSTRAINT "FiscalTrial_held_check"
  CHECK ("status" <> 'HELD' OR ("deferredReason" IS NOT NULL AND "number" IS NULL));
