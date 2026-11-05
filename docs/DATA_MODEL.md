# Data Model

## Implemented schema

`Organization` tiene UUID, nombre, estado activo y timestamps UTC. Desde `20261102020311_organization_document_template` (SISTEMA-17) guarda además el logo a color del comprobante A4 (`documentLogo`, JPEG de hasta 60 KB, y `documentLogoUpdatedAt`) y las opciones de su plantilla en `documentTemplate` (JSON). Son nullable: sin configurar, el A4 usa el encabezado del ticket. El logo blanco y negro del ticket térmico sigue en `ticketHeader.logoRaster`. `documentTemplate.defaultFormat` (`TICKET`/`A4`, por defecto `TICKET`) es el formato de impresión de la organización; `Branch.printFormat` (`20261102022844_branch_print_format`, con `CHECK` a esos dos valores) lo reemplaza para una sucursal, y `NULL` significa usar el de la organización. `Branch` tiene UUID, `organizationId`, nombre, codigo, estado activo y timestamps UTC.

Una organizacion tiene muchas sucursales. La base impone unicidad de `(organizationId, code)` e indice sobre `organizationId`; por lo tanto el mismo codigo puede existir en organizaciones distintas.

Fase 1 agrega `User`, `UserOrganization`, `UserBranch`, `Role`, `Permission`, `RolePermission`, `UserOrganizationRole` y `AuthSession`. Un usuario puede pertenecer a varias organizaciones y tener varias sucursales dentro de ellas. Los roles se asignan a su membership organizacional, nunca de forma global.

`AuthSession` conserva solamente el hash del refresh token, su vencimiento y la revocacion. Las contrasenas se almacenan como hashes Argon2id. La definicion esta en `apps/api/prisma/schema.prisma`; las migraciones `20260817193337_init_organization_branch` y `20260817200151_add_authentication_authorization` estan aplicadas en PostgreSQL local.

Fase 2 incorpora `Category`, `Laboratory`, `Product`, `ProductBarcode`, `PriceList` y `ProductPrice`. Todas pertenecen a una organizacion excepto los codigos de barras, que dependen del producto. Cada producto puede tener varios codigos de barras y un precio actual por lista; `amountMinor` se guarda como `BigInt` en centavos de peso argentino. La unidad de venta del producto se persiste como `BOX`, `BLISTER` o `UNIT`; los productos ya existentes conservan `BOX` por defecto. La migracion `20260817222407_add_catalog` esta aplicada en PostgreSQL local.

`20261102144443_product_barcode_per_organization` (SISTEMA-20): `ProductBarcode` suma `organizationId` (completado desde su producto, FK compuesta `(productId, organizationId)` hacia `Product(id, organizationId)`) y `kind` (`PACKAGE`, `INTERNAL`, `EQUIVALENT`; los SG existentes pasan a `INTERNAL`). El unico global de `code` se reemplaza por `(organizationId, code)`. Restricciones CHECK: el principal es siempre `PACKAGE`, `INTERNAL` respeta `SG` + 12 digitos y `EQUIVALENT` es un GTIN numerico de 8 a 14 digitos, nunca principal.

`20261105120000_purchase_pack_lots` (SISTEMA-26): `PurchaseItem.packFactor` recuerda que el renglón vino en exhibidor; `ProductLot.packFactor` y `packCount` guardan cuántos entraron en el lote. Columnas aditivas con CHECK, sin rellenar lotes existentes.

`20261105033000_medicine_catalog_pack` (SISTEMA-26): `MedicineCatalogPack` guarda el código de un exhibidor de droguería, el código base y el factor (2 a 1000), con CHECK de que no sean el mismo código. Solo crea la tabla.

`20261105011859_medicine_catalog` (SISTEMA-26): base propia de medicamentos, compartida por todas las organizaciones (sin `organizationId`). `MedicineCatalogItem` guarda producto, fuente, precio en centavos, link y marcas, con CHECK de precio positivo, fuente conocida y link obligatorio fuera del padrón; `MedicineCatalogBarcode` guarda sus códigos, con `gtin` vacío si el dígito de control es inválido; `MedicineLaboratoryAlias` guarda las equivalencias de laboratorio. La migración solo crea tablas. Ver MEDICINE_CATALOG.md.

`20261102154305_medicine_reference_snapshot` (SISTEMA-21): `MedicineReferenceSnapshot` es la copia local de las fuentes de medicamentos, compartida por todas las organizaciones (sin `organizationId`): el padron oficial (`source = official`, indice por `gtin`) se reemplaza completo en cada descarga y Precios de Remedios/AlfaBeta guardan lo consultado por nombre (`lookupKey`). `PriceRefreshRun` registra cada corrida (`trigger` SCHEDULED/COMMAND/ORGANIZATION, `status` RUNNING/SUCCEEDED/FAILED/ABORTED/PAUSED, con CHECK) y un indice unico parcial permite una sola corrida global RUNNING. `PriceRefreshChange` guarda el antes y el despues de cada precio cambiado (con `organizationId`) para deshacer la corrida. `PlatformSetting` guarda ajustes de plataforma, por ejemplo la pausa de la aplicacion automatica.

## Operational MVP

La migración aditiva `20261027000000_product_brand_kind` incorpora `Product.brand` opcional (120 caracteres) y `Product.isMedication` booleano. Conserva como medicinales los registros previamente vinculados, con receta o categoría Medicamentos; no modifica precios ni historial. Marca se normaliza por espacios al guardar y se mantiene separada de Laboratory.

`Category.parentId` introduce un árbol por organización mediante la migración `20261026173000_category_tree`. La clave foránea compuesta `(parentId, organizationId)` impide relaciones entre organizaciones. Índices únicos parciales reservan el nombre normalizado por nivel, incluso en categorías archivadas. Las categorías existentes se conservan como raíces, sin modificar sus productos. La API valida ciclos dentro de una transacción con bloqueo por organización.

Proveedores y clientes ya cuentan con alta y listado. Inventario permite recepcionar lotes por sucursal y conserva un movimiento por cada ingreso. Las ventas completadas descomponen sus renglones en `SaleItem` y sus cobros en `SalePayment`; la salida descuenta lotes por FEFO y registra movimientos negativos de inventario. Los pagos en efectivo requieren una `CashSession` abierta para una caja de la sucursal.

Transferencias, devoluciones, ajustes explícitos, balances materializados, auditoría y reportes siguen pendientes de implementación funcional.
