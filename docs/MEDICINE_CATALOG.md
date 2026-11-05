# Base de medicamentos (SISTEMA-26)

Base propia de medicamentos dentro de la base principal, compartida por todas las
organizaciones porque es información pública. Se usa al crear productos y en la
actualización de precios de las 09:00 y 17:00. Es distinta del catálogo externo de no
medicamentos (`EXTERNAL_PRODUCT_CATALOG.md`), que no se modifica.

## Qué contiene

| Tabla                     | Contenido                                                       |
| ------------------------- | --------------------------------------------------------------- |
| `MedicineCatalogItem`     | Producto, fuente del precio, precio en centavos, link y marcas  |
| `MedicineCatalogBarcode`  | Códigos de cada producto, también los de dígito de control malo |
| `MedicineLaboratoryAlias` | Equivalencias de laboratorio entre la base y las fuentes        |

Solo entran productos con precio y link: lo demás se revisa aparte en el Excel de
productos sin link y se carga si aparece una solución.

Carga del 04/11/2026: 17.848 productos (padrón 16.441, Precios de Remedios 1.398,
AlfaBeta 9), 109 dados de baja en el padrón y 141 laboratorios.

## Reglas

- **Prioridad:** padrón oficial; si no está, Precios de Remedios; los casos de
  laboratorio distinto, AlfaBeta.
- **Padrón:** cruza por CLAVE (`ab-<CLAVE>`), después por código y, solo para lo que ya
  viene del padrón, por nombre y presentación exactos con una única coincidencia.
- **Dado de baja (`BAJA=1`):** la web oficial lo sigue publicando con precio, así que
  toma el precio del padrón y queda marcado en `officialDelisted`. Sin precio, sigue con
  su otra fuente. Si `BAJA` vuelve a 0, se desmarca.
- **Precios de Remedios y AlfaBeta:** se leen por el link guardado, una vez por link, y
  el precio sale de la fila guardada en `sourceRowKey`. Se recorren las páginas hasta
  encontrar todas las filas buscadas.
- La búsqueda manual de Precios de Remedios sigue las combinaciones de sustancias
  que muestra el sitio antes de leer las presentaciones. Si hay más de diez
  combinaciones, pide precisar el nombre para evitar consultas excesivas.
- Nuevo producto consulta primero la base propia para las opciones Medicamentos y
  Remedios. Si un nombre aún no está cargado, Remedios consulta el sitio externo;
  las respuestas externas repetidas se conservan cinco minutos en memoria.
- **Laboratorio:** una fila con alias en `duda` o `distinto` no se usa.
- **Control de precio:** un valor menor a la mitad o mayor al doble del anterior no se
  aplica; queda en `reviewReason`.
- **Fuente caída:** se conservan los precios. Con cinco links seguidos sin respuesta se
  deja de consultar esa fuente en la corrida; las demás siguen. El resultado queda en
  `PriceRefreshRun.message`.
- **Recorrido de enlaces (05/11/2026):** hasta cuatro enlaces se leen en paralelo,
  manteniendo 1,5 segundos entre inicios de solicitudes a las fuentes. El log informa
  el avance cada 50 enlaces. Un timeout o error transitorio se reintenta una vez,
  sin reintentar enlaces inválidos. Una fuente con enlaces fallidos, una descarga del padrón
  fallida o un error de la base deja la corrida en `PARTIAL`, con el detalle en
  `PriceRefreshRun.message`; no se informa como exitosa una actualización incompleta.
- **Productos vinculados:** toman el precio de la base por código o por nombre y
  presentación exactos, con las reglas de siempre (divisor, recargo, unidad de venta,
  pausa e historial). Lo que no está en la base sigue con su fuente anterior.
- **Nuevo producto:** busca por nombre, presentación, laboratorio, droga o código. Por
  código, una coincidencia única se carga y vincula sola, de cualquier fuente. Si el
  código coincide con varios, elige el usuario.
- **Compras:** al revisar una factura o un Excel, "Crear N y agregar todo" da de alta los
  renglones sin producto con los datos de la base. Se crean de a uno; si todos salen
  bien se agregan al pedido, y si alguno falla se muestra cuál y por qué, sin perder los
  creados.
- **Exhibidores de droguería:** códigos que no están en ninguna fuente y equivalen a N
  unidades de un envase (`MedicineCatalogPack`). En Compras, 1 exhibidor suma N unidades
  al producto base y el costo se divide por N. El stock real es el del envase base; los
  exhibidores enteros son los que entraron como tales en cada lote
  (`ProductLot.packFactor` y `packCount`), limitados por stock del lote ÷ N sin decimales: al vender una unidad de un
  exhibidor ya no cuenta como exhibidor. Las cajas sueltas no arman exhibidores, aunque sumen N. Los lotes
  anteriores a esta marca no cuentan como exhibidores. El lote y el vencimiento se cargan al
  recibir, como en cualquier compra. Si se vende un exhibidor entero, su código carga N
  unidades del producto base en la venta. Esas unidades salen de un exhibidor cerrado
  aunque otro lote venza antes, porque es lo que deja el estante; las cajas sueltas siguen
  saliendo de lo que vence antes. Si el nombre dice
  `EXHIB. X20`, se confirma el envase base una vez por código. Es un dato del envase, común
  a todas las farmacias, y queda en auditoría quién lo cargó.
- **Link del padrón:** la web oficial no busca por código ni admite link a un producto,
  así que esas referencias van sin link. El precio exacto llega por la API.

## Limitaciones

- El padrón informa pesos enteros, sin centavos.
- Un producto nuevo del padrón no entra solo a la base: hay que agregarlo con una carga.
- La búsqueda devuelve hasta 30 resultados, sin páginas.
- AlfaBeta limita a unas 100 páginas diarias por IP. La base usa 9 por corrida y por
  ambiente, 36 por día con test y producción en el mismo VPS.

## Comandos

Local, con la API compilada:

```powershell
pnpm --filter @gestion/api catalogo-medicamentos estado
pnpm --filter @gestion/api catalogo-medicamentos importar <archivo.jsonl>
pnpm --filter @gestion/api catalogo-medicamentos actualizar
```

`actualizar` lee Remedios y AlfaBeta sin tocar productos. `importar` solo agrega lo que
falta y no pisa precios ya actualizados.

## Generar el archivo de carga

Sale de la carpeta de trabajo que tiene `catalogo_precios.db` y `padron_vivo.json`. Queda
en `data/medicine-catalog/`, ignorada por Git.

```powershell
uv run --python 3.12 python scripts/medicine-catalog/exportar.py <carpeta> data/medicine-catalog/catalogo.jsonl
```

## Pasar a otro ambiente

Migraciones de esta funcionalidad, en orden. Son aditivas: no modifican datos existentes.

1. `20261105011859_medicine_catalog`
2. `20261105033000_medicine_catalog_pack`
3. `20261105120000_purchase_pack_lots` (agrega columnas nullable o con valor por defecto a
   `PurchaseItem` y `ProductLot`)

Los exhibidores no viajan en el archivo de carga: se confirman en Compras en cada ambiente.

Son dos pasos: la migración viaja con la publicación y los datos se cargan después. Con
la base vacía el sistema sigue funcionando como antes, así que entre uno y otro no se
rompe nada.

### Local (cada desarrollador)

```powershell
git checkout main; git pull
pnpm install
pnpm --filter @gestion/api exec prisma migrate deploy
pnpm --filter @gestion/api prisma:generate
pnpm --filter @gestion/api build
pnpm --filter @gestion/api catalogo-medicamentos importar <ruta-absoluta>\catalogo.jsonl
```

`prisma:generate` falla con `EPERM` si la API está corriendo: frenarla antes. El
archivo `catalogo.jsonl` no está en Git; se pasa a mano.

### Test (hoy llamado preprod)

1. Publicar desde `main` limpio. Hace respaldo, pausa la API y aplica la migración:

   ```powershell
   git checkout main; git pull; git status
   & '.\Publicar Preproduccion.cmd'
   ```

2. Subir el archivo y el script al VPS:

   ```powershell
   scp -i "$env:USERPROFILE\.ssh\oracle-gestion.key" data\medicine-catalog\catalogo.jsonl deploy\oracle\import-medicine-catalog.sh ubuntu@163.176.241.51:/tmp/
   ```

3. Cargar y borrar el archivo temporal:

   ```powershell
   ssh -i "$env:USERPROFILE\.ssh\oracle-gestion.key" ubuntu@163.176.241.51 'sed -i "s/\r$//" /tmp/import-medicine-catalog.sh; sudo -n bash /tmp/import-medicine-catalog.sh preprod /tmp/catalogo.jsonl; rm -f /tmp/catalogo.jsonl /tmp/import-medicine-catalog.sh'
   ```

4. Controlar que el `estado` final informe 17.848 productos y probar Nuevo producto.

### Producción

Igual que test, con autorización explícita, fuera del horario de cobros y desde un tag
ya probado en test (`publicar-ambientes`). Usar `Publicar Produccion.cmd` y `prod` en el
paso 3. Nunca aplicar la migración fuera del publicador.

## Volver atrás

La migración solo crea tablas nuevas. Si hay un problema con los precios, `precios
pausar` frena su aplicación y `precios deshacer <idCorrida>` restaura la corrida
(`PRODUCTS.md`). Las tablas no se borran.
