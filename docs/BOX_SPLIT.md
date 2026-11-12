# Abrir cajas (SISTEMA-103)

## Para qué

La farmacia compra **Buscapina Duo comp.rec. x100** porque sale más barata, pero muchas veces la vende como **Buscapina Duo blíster x10**. En el catálogo son **dos productos distintos**, cada uno con su código y su precio del padrón. Otras veces conviene vender la caja x100 entera.

«Abrir cajas» pasa N cajas de un lote de la x100 al stock del x10:

- suma N × 10;
- conserva el **mismo número de lote y vencimiento**;
- divide el costo.

Nunca se abre nada solo en la venta: abre el operador cuando decide vender como blíster.

## Vínculo (Productos)

La tarjeta se llama **«Se abre en unidades»**: sirve para medicamentos (caja x100 en blísteres x10) y para cualquier pack (caja de 24 shampoos en el shampoo individual). El buscador muestra primero las otras presentaciones del mismo producto y, al escribir, busca en **todo el catálogo** (hasta 50 resultados).

En el editor de la caja, sección «Precio y venta», está la tarjeta **«Se abre en blísteres»**, al lado de «Fraccionar precio». Al marcarla aparecen debajo:

- **Producto que se arma al abrir:** un buscador. Ofrece las presentaciones con el mismo nombre base.
- **Unidades por caja:** de 2 a 1000.

Hay además una **sugerencia** con el producto del mismo nombre y laboratorio. El número sale de las presentaciones («x 100» ÷ «x 10» = 10). Es solo una ayuda: el operador elige y confirma.

Se guarda en `Product.splitTargetProductId` y `Product.splitFactor`, y se audita como `PRODUCT_SPLIT_LINK_UPDATED`. Guardar el vínculo no toca el stock. Reglas:

- Los dos campos van juntos.
- El factor va de 2 a 1000.
- El destino es de la misma organización (FK compuesta), está activo y no es el mismo producto.
- No se admite el ciclo directo: si el x10 ya se abre en la x100, no se puede vincular al revés.
- Al eliminar definitivamente un producto sin uso, las cajas que se abrían en él quedan sin vínculo.

## Cuándo se abre

| Dónde                   | Cómo                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inventario**          | Botón **«Abrir cajas»** en el lote. Aparece si el producto tiene vínculo y el lote tiene stock vendible.                                                       |
| **Productos**           | Ícono **«Abrir cajas»** en la fila. Abre el mismo diálogo con selector de lote.                                                                                |
| **Compras, al recibir** | En el lote recibido de un producto con vínculo aparece **«Abrir ya [N] / todas»**, que muestra «+20 Buscapina Duo x10». Por defecto es 0: se recibe como caja. |

**El diálogo:**

- muestra lote, cajas disponibles y el resultado («2 cajas de … (lote L1, vence 05/2027) → +20 …, mismo lote y vencimiento»);
- usa un `requestId` por intento, así que reintentar no abre dos veces.

**En la compra:**

- la compra, su costo y la deuda siguen siendo por la caja x100, que es lo que facturó la droguería;
- la apertura queda dentro de la misma transacción de la recepción y guarda `purchaseReceiptId`.

**Sin conexión** (funciona igual):

- **Inventario y Productos:** la apertura se guarda en la PC, firmada por quien la hizo, como operación de inventario `APERTURA` (`INVENTORY_STOCK_SPLIT`).
  - El stock de la PC ya muestra la caja abierta: resta las cajas y suma al otro producto con el mismo lote, vencimiento y costo dividido. El blíster se puede vender enseguida.
  - Al volver internet se manda sola, en orden y una sola vez.
  - Si otra PC vendió cajas mientras tanto, se abren hasta las que haya, con el aviso «Apertura mayor al stock».
  - Si no se puede aplicar (por ejemplo, otro vencimiento en el lote destino), queda rechazada para revisar.
- **Compras:** «Abrir ya» también se ofrece sin conexión. La PC suma lo abierto al producto chico y el servidor lo aplica al sincronizar la recepción. Si al llegar no se puede abrir, **la recepción entra igual como caja** y queda auditado (`STOCK_SPLIT_SKIPPED`), para abrirla después desde Inventario.

**Abrir en otra presentación.** En el diálogo, «Abrir en» trae por defecto el producto del vínculo con su número. Se puede elegir otra presentación del mismo nombre, por ejemplo la x100 en **x20** (5 por caja) en lugar del blíster x10. La sugerencia calcula el número desde las presentaciones; si no puede, se escribe a mano.

La API recibe `targetProductId` y `factor` opcionales; sin ellos usa el vínculo. Se valida lo mismo que en el vínculo:

- el destino es de la organización y está activo;
- no es el mismo producto;
- no se abre a su vez en esta caja;
- el factor va de 2 a 1000.

El vínculo guardado no cambia.

## Qué registra (`POST …/branches/:branchId/inventory/splits`, `INVENTORY_MANAGE`)

Todo en una transacción:

1. **Idempotencia:** `pg_advisory_xact_lock` por `requestId`. El mismo `requestId` con los mismos datos devuelve la apertura previa; con otros datos, 409.
2. **Lote origen:** se bloquea (`FOR UPDATE`) y se valida:
   - que tenga vínculo;
   - que el lote sea de la sucursal;
   - que no esté vencido;
   - que haya cajas suficientes.

   Después se descuenta con `updateMany({ quantity: { gte } })`.

3. **Lote destino:** `branchId + producto destino + mismo número`.
   - Si existe con **otro vencimiento**, da 409 y no se toca nada.
   - Si se crea, queda con el mismo vencimiento y costo = costo de la caja ÷ factor, redondeado a centavos.
   - Si ya existía, solo suma.
4. **`StockSplit`:** origen, destino, lotes, cajas, factor, actor, `purchaseReceiptId` y huella.
5. **Movimientos con `referenceType = "STOCK_SPLIT"`:**
   - `ADJUSTMENT_OUT` en la caja: −cajas;
   - `ADJUSTMENT_IN` en el blíster: + cajas × factor, con `unitCostMinor`, **repartido por proveedor** con el mismo criterio que las transferencias (sale lo más viejo del lote). El blíster conserva su proveedor para devoluciones y reportes.
6. **Auditoría** `PRODUCT_LOT` / `STOCK_SPLIT`.

El historial de Inventario lo muestra como «Caja abierta» y «Ingreso por apertura de caja».

## Fuera de alcance

- Deshacer una apertura: hoy se corrige con un ajuste.
- Abrir sola una caja en el POS cuando falta el blíster.
- Vínculos de más de un nivel (caja → blíster → unidad).

## Código

- **API:**
  - `catalog/split-link.ts` y `catalog.service.ts` (`vincularApertura`);
  - `inventory/stock-split.ts` (`abrirCajasEnTx`);
  - `inventory.service.ts` (`split`);
  - `inventory/lot-suppliers.ts` (`STOCK_SPLIT`);
  - `purchases.service.ts` (`openBoxes`).
- **Web:**
  - `split-link-fields.tsx` y `lib/split-link.ts`;
  - `split-boxes-dialog.tsx` y `lib/split-boxes.ts`;
  - `inventory-stock-table.tsx`;
  - `purchase-receipt-table.tsx` (`ReceiptOpenBoxes`);
  - `operation-history.tsx`.
- **Integración:** `apps/api/test/abrir-cajas.integration.spec.ts`.
