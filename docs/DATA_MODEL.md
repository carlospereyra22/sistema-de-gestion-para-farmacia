# Data Model

## Implemented schema

`Organization` tiene UUID, nombre, estado activo y timestamps UTC. `Branch` tiene UUID, `organizationId`, nombre, codigo, estado activo y timestamps UTC.

Una organizacion tiene muchas sucursales. La base impone unicidad de `(organizationId, code)` e indice sobre `organizationId`; por lo tanto el mismo codigo puede existir en organizaciones distintas.

Fase 1 agrega `User`, `UserOrganization`, `UserBranch`, `Role`, `Permission`, `RolePermission`, `UserOrganizationRole` y `AuthSession`. Un usuario puede pertenecer a varias organizaciones y tener varias sucursales dentro de ellas. Los roles se asignan a su membership organizacional, nunca de forma global.

`AuthSession` conserva solamente el hash del refresh token, su vencimiento y la revocacion. Las contrasenas se almacenan como hashes Argon2id. La definicion esta en `apps/api/prisma/schema.prisma`; las migraciones `20260817193337_init_organization_branch` y `20260817200151_add_authentication_authorization` estan aplicadas en PostgreSQL local.

Fase 2 incorpora `Category`, `Laboratory`, `Product`, `ProductBarcode`, `PriceList` y `ProductPrice`. Todas pertenecen a una organizacion excepto los codigos de barras, que dependen del producto. Cada producto puede tener varios codigos de barras y un precio actual por lista; `amountMinor` se guarda como `BigInt` en centavos de peso argentino. La unidad de venta del producto se persiste como `BOX`, `BLISTER` o `UNIT`; los productos ya existentes conservan `BOX` por defecto. La migracion `20260817222407_add_catalog` esta aplicada en PostgreSQL local.

## Operational MVP

La migración aditiva `20261027000000_product_brand_kind` incorpora `Product.brand` opcional (120 caracteres) y `Product.isMedication` booleano. Conserva como medicinales los registros previamente vinculados, con receta o categoría Medicamentos; no modifica precios ni historial. Marca se normaliza por espacios al guardar y se mantiene separada de Laboratory.

`Category.parentId` introduce un árbol por organización mediante la migración `20261026173000_category_tree`. La clave foránea compuesta `(parentId, organizationId)` impide relaciones entre organizaciones. Índices únicos parciales reservan el nombre normalizado por nivel, incluso en categorías archivadas. Las categorías existentes se conservan como raíces, sin modificar sus productos. La API valida ciclos dentro de una transacción con bloqueo por organización.

Proveedores y clientes ya cuentan con alta y listado. Inventario permite recepcionar lotes por sucursal y conserva un movimiento por cada ingreso. Las ventas completadas descomponen sus renglones en `SaleItem` y sus cobros en `SalePayment`; la salida descuenta lotes por FEFO y registra movimientos negativos de inventario. Los pagos en efectivo requieren una `CashSession` abierta para una caja de la sucursal.

Transferencias, devoluciones, ajustes explícitos, balances materializados, auditoría y reportes siguen pendientes de implementación funcional.
