-- SISTEMA-71: transferencias sin conexión. Preparar, despachar y recibir hecho
-- sin internet se sincroniza como operación sin conexión, con sus avisos.

-- Clave de la PC: la misma transferencia no se crea dos veces y la preparada
-- sin conexión se despacha nombrándola por esta clave.
ALTER TABLE "Transfer" ADD COLUMN "clientOperationId" UUID;
CREATE UNIQUE INDEX "Transfer_organizationId_clientOperationId_key"
  ON "Transfer"("organizationId", "clientOperationId");

ALTER TABLE "OfflineOperation" DROP CONSTRAINT "OfflineOperation_kind_check";
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_kind_check" CHECK ("kind" IN (
  'SALE', 'CASH_OPEN', 'CASH_MOVEMENT', 'CASH_CLOSE', 'ACCOUNT_RECEIPT',
  'ACCOUNT_ASSIGN', 'ACCOUNT_DEBT_INCREASE', 'ACCOUNT_TOTAL_DEBT_INCREASE',
  'ACCOUNT_PRICE_UPDATE', 'ACCOUNT_CONFIGURE', 'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE', 'TRANSFER_CREATE', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE'
));

-- TRANSFERENCIA_YA_DESPACHADA / TRANSFERENCIA_YA_RECIBIDA: otra PC ya la
-- despachó o recibió; no se movió stock otra vez.
ALTER TABLE "OfflineSyncIssue" DROP CONSTRAINT "OfflineSyncIssue_kind_check";
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_kind_check" CHECK ("kind" IN (
  'PRECIO_DISTINTO', 'STOCK_FALTANTE', 'PRODUCTO_NO_DISPONIBLE',
  'CLIENTE_INACTIVO', 'LISTA_INACTIVA', 'LIMITE_CREDITO', 'CAJA_CERRADA',
  'FACTURA_NO_PREPARADA', 'MOVIMIENTO_RETENIDO', 'EGRESO_SUPERA_EFECTIVO',
  'SALDO_A_FAVOR', 'CAJA_YA_ABIERTA', 'OTRA_CAJA_ABIERTA', 'CIERRE_DISTINTO',
  'SALDO_DISTINTO', 'CONFIGURACION_PISADA', 'CLIENTE_DUPLICADO',
  'TRANSFERENCIA_YA_DESPACHADA', 'TRANSFERENCIA_YA_RECIBIDA'
));
