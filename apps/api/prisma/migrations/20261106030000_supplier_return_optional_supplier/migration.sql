-- Devoluciones sin proveedor (SISTEMA-36): stock que entró sin ese dato y que igual
-- tiene que poder salir. Las devoluciones existentes conservan su proveedor.
ALTER TABLE "SupplierReturn" ALTER COLUMN "supplierId" DROP NOT NULL;
