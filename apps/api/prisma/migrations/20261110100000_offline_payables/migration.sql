-- SISTEMA-73: proveedores y cuentas por pagar sin conexión. El alta, la edición,
-- la baja y la restauración de proveedores, y el registro de deudas, pagos y
-- anulaciones hechos sin internet se sincronizan como operación sin conexión,
-- con sus avisos.

ALTER TABLE "OfflineOperation" DROP CONSTRAINT "OfflineOperation_kind_check";
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_kind_check" CHECK ("kind" IN (
  'SALE', 'CASH_OPEN', 'CASH_MOVEMENT', 'CASH_CLOSE', 'ACCOUNT_RECEIPT',
  'ACCOUNT_ASSIGN', 'ACCOUNT_DEBT_INCREASE', 'ACCOUNT_TOTAL_DEBT_INCREASE',
  'ACCOUNT_PRICE_UPDATE', 'ACCOUNT_CONFIGURE', 'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE', 'TRANSFER_CREATE', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE',
  'SUPPLIER_CREATE', 'SUPPLIER_UPDATE', 'SUPPLIER_STATE',
  'PAYABLE_CREATE', 'PAYABLE_PAYMENT', 'PAYABLE_PAYMENT_VOID'
));

-- PROVEEDOR_INACTIVO: el proveedor estaba dado de baja al llegar; se registró igual.
-- COMPROBANTE_REPETIDO: el comprobante ya estaba cargado con otros datos; la
--   deuda se registró sin bloquear el número, para unificarla.
-- PAGO_SUPERA_SALDO: el pago superaba lo que se debía al llegar; se registró
--   hasta el saldo.
-- PAGO_YA_ANULADO: otra PC ya había anulado ese pago.
ALTER TABLE "OfflineSyncIssue" DROP CONSTRAINT "OfflineSyncIssue_kind_check";
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_kind_check" CHECK ("kind" IN (
  'PRECIO_DISTINTO', 'STOCK_FALTANTE', 'PRODUCTO_NO_DISPONIBLE',
  'CLIENTE_INACTIVO', 'LISTA_INACTIVA', 'LIMITE_CREDITO', 'CAJA_CERRADA',
  'FACTURA_NO_PREPARADA', 'MOVIMIENTO_RETENIDO', 'EGRESO_SUPERA_EFECTIVO',
  'SALDO_A_FAVOR', 'CAJA_YA_ABIERTA', 'OTRA_CAJA_ABIERTA', 'CIERRE_DISTINTO',
  'SALDO_DISTINTO', 'CONFIGURACION_PISADA', 'CLIENTE_DUPLICADO',
  'TRANSFERENCIA_YA_DESPACHADA', 'TRANSFERENCIA_YA_RECIBIDA',
  'PROVEEDOR_INACTIVO', 'COMPROBANTE_REPETIDO', 'PAGO_SUPERA_SALDO',
  'PAGO_YA_ANULADO'
));
