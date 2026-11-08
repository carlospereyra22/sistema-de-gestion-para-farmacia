-- SISTEMA-67: caja sin conexión. Las aperturas y los cierres hechos sin
-- internet también se sincronizan como operaciones sin conexión, y suman sus
-- avisos "a revisar".
ALTER TABLE "OfflineOperation" DROP CONSTRAINT "OfflineOperation_kind_check";
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_kind_check"
  CHECK ("kind" IN ('SALE', 'CASH_OPEN', 'CASH_MOVEMENT', 'CASH_CLOSE', 'ACCOUNT_RECEIPT'));

-- CAJA_YA_ABIERTA: otra PC abrió esa caja mientras tanto; se usa esa sesión.
-- OTRA_CAJA_ABIERTA: quien abrió ya tenía otra caja abierta.
-- CIERRE_DISTINTO: el esperado del servidor no es el que vio la PC, o la caja
-- ya estaba cerrada.
ALTER TABLE "OfflineSyncIssue" DROP CONSTRAINT "OfflineSyncIssue_kind_check";
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_kind_check" CHECK ("kind" IN (
  'PRECIO_DISTINTO', 'STOCK_FALTANTE', 'PRODUCTO_NO_DISPONIBLE',
  'CLIENTE_INACTIVO', 'LISTA_INACTIVA', 'LIMITE_CREDITO', 'CAJA_CERRADA',
  'FACTURA_NO_PREPARADA', 'MOVIMIENTO_RETENIDO', 'EGRESO_SUPERA_EFECTIVO',
  'SALDO_A_FAVOR', 'CAJA_YA_ABIERTA', 'OTRA_CAJA_ABIERTA', 'CIERRE_DISTINTO'
));
