-- SISTEMA-70: la edición de un cliente hecha sin conexión (lista de precios,
-- facturación, contacto) también se sincroniza como operación sin conexión.
ALTER TABLE "OfflineOperation" DROP CONSTRAINT "OfflineOperation_kind_check";
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_kind_check" CHECK ("kind" IN (
  'SALE', 'CASH_OPEN', 'CASH_MOVEMENT', 'CASH_CLOSE', 'ACCOUNT_RECEIPT',
  'ACCOUNT_ASSIGN', 'ACCOUNT_DEBT_INCREASE', 'ACCOUNT_TOTAL_DEBT_INCREASE',
  'ACCOUNT_PRICE_UPDATE', 'ACCOUNT_CONFIGURE', 'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE'
));
