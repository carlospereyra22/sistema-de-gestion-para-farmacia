# Rendimiento con catálogos e historiales grandes (SISTEMA-74)

Problema reportado (10/11/2026): con dos sucursales abiertas el sistema se
enlentecía, Compras tardaba mucho y sin conexión todo se volvía cada vez más
lento al navegar. Las farmacias pueden tener 60.000 productos o más (medicamentos
y productos propios sin datos en internet), así que se midió con ese volumen.

## Cómo medir

```powershell
# Esquema aislado en gestion_dev; se borra al terminar. Tarda ~2 minutos.
$env:RENDIMIENTO = "1"
pnpm --filter @gestion/api exec jest --runInBand test/rendimiento-catalogo
```

Siembra 60.000 productos, 2 sucursales, 20.000 lotes por sucursal con sus
movimientos, 3.000 compras de 30 renglones, 3.000 deudas (la mitad pagadas) y
3.000 clientes con 20 movimientos de cuenta corriente. Se ajusta con
`RENDIMIENTO_PRODUCTOS`, `RENDIMIENTO_LOTES`, `RENDIMIENTO_COMPRAS`,
`RENDIMIENTO_DEUDAS` y `RENDIMIENTO_CLIENTES`. `test/catalogo-grande` (siempre
corre, 9.000 productos) protege el listado del catálogo.

## Lo que se encontró y qué se cambió

| Problema                                                                                                                                         | Efecto                                                             | Cambio                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| El listado de productos cargaba códigos de barras como relación de dos columnas (SISTEMA-20)                                                     | Se caía entre 6.000 y 8.000 productos (PostgreSQL: límite de pila) | Cada relación en su propia consulta por organización (`catalog.service.ts`)                                              |
| Precios efectivos y base de medicamentos con un `IN` por producto                                                                                | Se caían pasados ~32.000                                           | Consultas por lista o por tabla, sin lista de ids                                                                        |
| La campanita pedía catálogo y stock completos cada minuto y al volver el foco, en cada PC                                                        | Con 60k productos, ~46 MB por minuto por PC                        | Usa el catálogo y el stock que ya tiene el shell                                                                         |
| El shell pedía el catálogo dos veces por actualización                                                                                           | El doble de carga                                                  | El de la organización sólo en Productos, Listas de precios y Transferencias; tras sincronizar se actualiza sólo el stock |
| Catálogo entero en cada actualización (2 s, 46 MB) y > 8 MB no entraba en la copia sin conexión                                                  | Lento y sin catálogo sin conexión                                  | Catálogo por partes (abajo)                                                                                              |
| Compras recorría el catálogo por cada renglón de cada compra en cada redibujo; varias pantallas buscaban productos con `find` dentro de listados | Pantallas trabadas                                                 | Índice por id (`lib/indice-productos.ts`) y textos de búsqueda armados una vez                                           |
| Productos: con filtro de vencimiento o de lote recorría todos los lotes por producto                                                             | ~1.200 millones de comparaciones por redibujo                      | Lotes indexados por producto                                                                                             |
| Sin conexión, cada pantalla intentaba salir a la red antes de usar la copia, sin tiempo máximo                                                   | Pedidos colgados que se acumulaban: cada pantalla más lenta        | Sin conexión conocida va directo a la copia; con conexión, 30 s máximo por pedido                                        |
| La bandeja de la PC se leía clave por clave desde ~20 lugares                                                                                    | Más lenta cuanto más se trabajaba sin conexión                     | Una sola lectura y en memoria hasta que cambie                                                                           |
| Opciones de Cuentas por pagar traían todos los renglones de todas las compras                                                                    | 3,6 s                                                              | Suma en SQL: 0,05 s                                                                                                      |
| Compras e historial de Inventario traían todo el historial                                                                                       | 24 MB y 18 MB, cada vez más                                        | Por defecto, últimos 90 días (Compras: más todos los pedidos abiertos); con fechas, ese rango                            |
| JSON sin comprimir                                                                                                                               | Descargas grandes                                                  | `gzip` en nginx para JSON, salvo `/auth/` (BREACH)                                                                       |

## Catálogo por partes

El catálogo se divide en 256 partes por los dos primeros caracteres del id del
producto. `GET catalog/products/versiones` devuelve la versión de cada parte (un
hash del contenido de productos, códigos, precio general, estado en la sucursal
y foto) y, si cambió, el diccionario de categorías y laboratorios.
`GET catalog/products/partes?partes=0a,1f,...` (hasta 32) devuelve esos
productos. La PC (`lib/catalogo-local.ts`) guarda cada parte en IndexedDB, bajo
el usuario, y sólo vuelve a pedir las que cambiaron. Con 60.000 productos:

| Pedido                                           | Tiempo | Tamaño  |
| ------------------------------------------------ | ------ | ------- |
| Catálogo completo (antes, en cada actualización) | ~2 s   | 46 MB   |
| Versiones (cada actualización)                   | ~0,2 s | 10 KB   |
| 32 partes (la primera vez se piden 8 de estas)   | ~0,4 s | ~6 MB   |
| Una parte después de editar un producto          | —      | ~180 KB |

Sin conexión el catálogo se arma con las partes guardadas. Si la API todavía no
tiene estas rutas (la web se publica aparte), la web pide el catálogo completo
como antes. `GET catalog/products` se conserva.

## Stock por partes (SISTEMA-77)

Igual que el catálogo: 256 partes por los dos primeros caracteres del id del
producto de cada lote (`GET inventory/stock/versiones` y
`GET inventory/stock/partes?partes=...`). La versión de cada parte resume los
lotes con stock (cantidad, vencimiento, número, costo, exhibidores), el nombre
del producto, las cargas y devoluciones por proveedor de cada lote (de ahí sale
de quién son las unidades), los proveedores de la organización y si quien pide
ve costos. La PC guarda las partes (`lib/copia-por-partes.ts`, el mismo módulo
que el catálogo) y lo que depende del día (vencido o por vencer) lo calcula al
armar. Con 20.000 lotes: stock entero 0,9 s y 10 MB; versiones 0,12 s y 10 KB;
32 partes 0,24 s y 1,25 MB.

## Prueba de carga (SISTEMA-77)

`test/rendimiento-catalogo` (con `RENDIMIENTO=1`) simula 10 PCs de dos
sucursales actualizando a la vez, 5 vueltas, con una venta por sucursal en
cada vuelta (`RENDIMIENTO_PCS`, `RENDIMIENTO_VUELTAS`). 60.000 productos y
20.000 lotes por sucursal:

| Cada actualización pide              | Tiempo total | Por PC (p50 / p95) | Datos    |
| ------------------------------------ | ------------ | ------------------ | -------- |
| Catálogo y stock enteros (antes)     | 89,7 s       | 16,1 s / 19,9 s    | 2.829 MB |
| Versiones y partes cambiadas (ahora) | 6,0 s        | 1,0 s / 1,3 s      | 4 MB     |

Con el método anterior el proceso llegó a 2,7 GB de memoria. Los servicios se
llaman dentro del mismo proceso: no incluye red, nginx ni compresión.

## Cuentas corrientes (SISTEMA-75)

El listado trae saldo, cantidad de movimientos y último cobro calculados en
PostgreSQL; los movimientos se piden al abrir un cliente. Con 3.000 clientes de
20 movimientos: de 1,4 s y 27 MB a 0,14 s y 1 MB.

## Pendiente

- El estado de cuenta de la sucursal (`customer-accounts/statement`, para
  imprimir resúmenes) trae todos los movimientos de la sucursal: con 3.000
  clientes de 20 movimientos, 1,2 s y 11,5 MB. La precarga lo pide cada 10
  minutos para tenerlo sin conexión.
- Costos de inventario (5 MB) se calculan con todo el historial de recepciones.
- Prueba con varias PCs reales por HTTP (la prueba de carga llama a los
  servicios dentro del proceso: no mide red, nginx ni compresión).
