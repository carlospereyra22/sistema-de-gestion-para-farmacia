-- SISTEMA-79: productos e inventario sin conexión. El alta, la edición, el
-- estado en la sucursal, los códigos equivalentes y la eliminación de
-- productos, el alta de categorías y laboratorios, y los ingresos, ajustes,
-- devoluciones al proveedor y correcciones de lotes hechos sin internet se
-- sincronizan como operación sin conexión, con sus avisos.

ALTER TABLE "OfflineOperation" DROP CONSTRAINT "OfflineOperation_kind_check";
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_kind_check" CHECK ("kind" IN (
  'SALE', 'CASH_OPEN', 'CASH_MOVEMENT', 'CASH_CLOSE', 'ACCOUNT_RECEIPT',
  'ACCOUNT_ASSIGN', 'ACCOUNT_DEBT_INCREASE', 'ACCOUNT_TOTAL_DEBT_INCREASE',
  'ACCOUNT_PRICE_UPDATE', 'ACCOUNT_CONFIGURE', 'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE', 'TRANSFER_CREATE', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE',
  'SUPPLIER_CREATE', 'SUPPLIER_UPDATE', 'SUPPLIER_STATE',
  'PAYABLE_CREATE', 'PAYABLE_PAYMENT', 'PAYABLE_PAYMENT_VOID',
  'CATALOG_PRODUCT_CREATE', 'CATALOG_PRODUCT_UPDATE', 'CATALOG_BRANCH_STATE',
  'CATALOG_BARCODE_ADD', 'CATALOG_BARCODE_REMOVE', 'CATALOG_PRODUCT_DELETE',
  'CATALOG_OPTION_CREATE',
  'INVENTORY_RECEIPT', 'INVENTORY_ADJUSTMENT', 'INVENTORY_SUPPLIER_RETURN',
  'INVENTORY_LOT_EDIT'
));

-- CODIGO_REPETIDO: el código de barras ya era de otro producto al llegar; la
--   operación se registró sin ese código, para unificarlo a mano.
-- DATO_PISADO: otra PC cambió después el mismo dato del producto o del lote;
--   quedó ese cambio (el más reciente).
-- AJUSTE_SUPERA_STOCK: el ajuste de salida o la devolución superaba lo que
--   quedaba en el lote al llegar; se registró hasta lo que había.
-- LOTE_REPETIDO: el número de lote ya existía para ese producto; no se cambió.
-- OPCION_EXISTENTE: la categoría o el laboratorio ya existía con ese nombre;
--   se usó el existente.
-- PRODUCTO_INACTIVO: el producto estaba desactivado al llegar el ingreso; se
--   registró igual.
ALTER TABLE "OfflineSyncIssue" DROP CONSTRAINT "OfflineSyncIssue_kind_check";
ALTER TABLE "OfflineSyncIssue" ADD CONSTRAINT "OfflineSyncIssue_kind_check" CHECK ("kind" IN (
  'PRECIO_DISTINTO', 'STOCK_FALTANTE', 'PRODUCTO_NO_DISPONIBLE',
  'CLIENTE_INACTIVO', 'LISTA_INACTIVA', 'LIMITE_CREDITO', 'CAJA_CERRADA',
  'FACTURA_NO_PREPARADA', 'MOVIMIENTO_RETENIDO', 'EGRESO_SUPERA_EFECTIVO',
  'SALDO_A_FAVOR', 'CAJA_YA_ABIERTA', 'OTRA_CAJA_ABIERTA', 'CIERRE_DISTINTO',
  'SALDO_DISTINTO', 'CONFIGURACION_PISADA', 'CLIENTE_DUPLICADO',
  'TRANSFERENCIA_YA_DESPACHADA', 'TRANSFERENCIA_YA_RECIBIDA',
  'PROVEEDOR_INACTIVO', 'COMPROBANTE_REPETIDO', 'PAGO_SUPERA_SALDO',
  'PAGO_YA_ANULADO',
  'CODIGO_REPETIDO', 'DATO_PISADO', 'AJUSTE_SUPERA_STOCK', 'LOTE_REPETIDO',
  'OPCION_EXISTENTE', 'PRODUCTO_INACTIVO'
));
