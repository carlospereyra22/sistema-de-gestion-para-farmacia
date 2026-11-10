-- SISTEMA-70: cuenta corriente sin conexión. Cobros, asignaciones, aumentos de
-- deuda, actualización de precios, configuración de la cuenta y alta de
-- clientes hechos sin internet también se sincronizan como operaciones sin
-- conexión, con sus avisos "a revisar".
ALTER TABLE "OfflineOperation" DROP CONSTRAINT "OfflineOperation_kind_check";
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_kind_check" CHECK ("kind" IN (
  'SALE', 'CASH_OPEN', 'CASH_MOVEMENT', 'CASH_CLOSE', 'ACCOUNT_RECEIPT',
  'ACCOUNT_ASSIGN', 'ACCOUNT_DEBT_INCREASE', 'ACCOUNT_TOTAL_DEBT_INCREASE',
  'ACCOUNT_PRICE_UPDATE', 'ACCOUNT_CONFIGURE', 'CUSTOMER_CREATE'
));

-- SALDO_DISTINTO: el artículo o la cuenta ya no debía lo que vio la PC; se
-- aplicó con el importe cobrado y lo que quedó se marca para revisar.
-- CONFIGURACION_PISADA: otra PC cambió el límite o el plazo después; queda el
-- cambio más reciente.
-- CLIENTE_DUPLICADO: el cliente dado de alta sin conexión repite un DNI/CUIT.
ALTER TABLE "OfflineSyncIssue" DROP CONSTRAINT "OfflineSyncIssue_kind_check";
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_kind_check" CHECK ("kind" IN (
  'PRECIO_DISTINTO', 'STOCK_FALTANTE', 'PRODUCTO_NO_DISPONIBLE',
  'CLIENTE_INACTIVO', 'LISTA_INACTIVA', 'LIMITE_CREDITO', 'CAJA_CERRADA',
  'FACTURA_NO_PREPARADA', 'MOVIMIENTO_RETENIDO', 'EGRESO_SUPERA_EFECTIVO',
  'SALDO_A_FAVOR', 'CAJA_YA_ABIERTA', 'OTRA_CAJA_ABIERTA', 'CIERRE_DISTINTO',
  'SALDO_DISTINTO', 'CONFIGURACION_PISADA', 'CLIENTE_DUPLICADO'
));
