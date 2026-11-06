# Plan de mejoras de Caja

Revisión de la vista de Caja y de su API (05/11/2026). Reúne los problemas encontrados, las decisiones tomadas y el trabajo por etapas. El funcionamiento actual está en `CASH_SIMPLE_IMPLEMENTATION.md` y `CASH_WORKSPACE.md`.

Ninguna etapa requiere migración y el cálculo del efectivo esperado no cambia. Las etapas 1 y 3 corrigen los datos que entran a ese cálculo, no la fórmula.

## Decisiones

- **Varias cajas abiertas a la vez** en una sucursal, como ya indica `BUSINESS_RULES.md`. La pantalla y el POS deben respetar la caja elegida.
- **Los egresos manuales mayores al efectivo disponible se bloquean** en la API. Vuelto y notas de crédito no se bloquean.
- **Fondo inicial sugerido:** un botón ofrece el contado del último cierre. Nunca se completa solo.
- **Diseño:** barra de estado arriba y pestañas Sesión e Historial.
- **Fuera de alcance:** conteo por billetes, ticket de cierre de 80 mm, arqueo parcial y corrección retroactiva de sesiones cerradas.

## Errores encontrados

| #   | Problema                                                                 | Causa                                                                                                            | Dónde                                                                  |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Último cierre muestra `Failed to execute 'json'` en una caja sin cierres | La API devuelve `null`, Nest responde con cuerpo vacío y el cliente ejecuta `response.json()`                    | `getLatestCashClosure` en `lib/api.ts`, `latestClosure` del controller |
| 2   | Con dos cajas abiertas, una queda invisible y no se puede operar         | La sesión es la primera abierta de la sucursal, sin mirar la caja elegida                                        | `refresh` en `workspace-shell.tsx`                                     |
| 3   | Las ventas caen en la última caja abierta                                | El POS usa esa misma sesión única                                                                                | `cashSessionId` de los pagos en `workspace-shell.tsx`                  |
| 4   | Anular una venta con vuelto descuadra el esperado                        | El pago deja de contar, pero el egreso del vuelto queda sin compensar: aparece un sobrante falso igual al vuelto | `cancel` en `sales.service.ts`                                         |
| 5   | Los importes de apertura y movimiento pasan por float                    | Se calcula `Number(x) * 100`, contra la regla de centavos; el cierre ya usa `cashCountMinor`                     | `open` y `movement` de `Cash` en `workspace-shell.tsx`                 |
| 6   | Hay textos en inglés visibles para el usuario                            | `Change for sale…`, `Cash register is unavailable`, `You do not have the required permission`, rango de fechas   | `sales.service.ts`, `cash.service.ts`                                  |
| 7   | Un egreso manual puede superar el efectivo y dejar el esperado negativo  | No hay validación                                                                                                | `movement` en `cash.service.ts`                                        |

El error 4 quedó confirmado con un test de integración: tras anular una venta con vuelto de $2,00 sobre un fondo de $10,00, el esperado daba $8,00.

## Problemas de funcionamiento

- Últimos movimientos no lista las ventas en efectivo, pero el esperado sí las suma: el cajero no puede reconstruir el saldo.
- Ingresos y Egresos incluyen el vuelto. Una venta de $800 pagada con $1.000 suma $1.000 a Ingresos y $200 a Egresos.
- No se ve lo cobrado con tarjeta y transferencia en la sesión, aunque el dato existe en `SalePayment.cashSessionId`.
- Los cobros pendientes están en el menú `···`, sin contador ni aviso al abrir o cerrar.
- Si un cierre se rechaza porque cambió el esperado, se pide actualizar pero la pantalla no se actualiza sola.
- En Historial, los filtros parecen vacíos pero aplican 30 días; Estado aplica al instante y las fechas con botón; faltante y sobrante se ven igual en rojo; no se puede filtrar por caja.
- El mínimo de 3 caracteres del motivo de un movimiento se valida recién en la API.
- Sin permiso, Abrir caja queda deshabilitado sin explicación.

## Problemas de presentación

- Con la caja cerrada, la mitad de la pantalla son tarjetas vacías con guiones.
- La caja se muestra en una tarjeta y se elige en otra.
- Los conceptos de movimiento muestran UUID y fechas ISO.
- En la confirmación de cierre, "Sin diferencia" aparece en un recuadro ámbar de alerta.
- `CASH_WORKSPACE.md` está desactualizado: dice que no hay códigos ni caja predeterminada, y ya existen.

## Etapas

Una rama y un PR por etapa, en este orden. La etapa 4 depende de las anteriores porque muestra sus datos y su selector.

### Etapa 1: correcciones (`feature/SISTEMA-37`)

1. Tratar el cuerpo vacío como `null` en `getLatestCashClosure`, con test.
2. Al anular una venta con vuelto, crear un ingreso compensatorio en la misma sesión, dentro de la transacción de `cancel`. Las sesiones cerradas no se tocan porque esa anulación ya se rechaza.
3. Usar `MoneyInput` en apertura, movimiento y cierre, y convertir a centavos sin float. `MoneyInput` escribe puntos de miles que `cashCountMinor` rechaza: hay que quitarlos antes, como hace `typedCostMinor`.
4. Pasar a español los textos de la API. Las filas históricas no se reescriben.
5. Refrescar la sesión cuando se rechaza un cierre, conservando lo contado.
6. Validar el motivo en el formulario y explicar la falta de permiso.

### Etapa 2: varias cajas abiertas (`feature/SISTEMA-38`)

1. Guardar en el shell todas las sesiones abiertas y la caja elegida, en lugar de una sola sesión.
2. Crear en `src/lib/` una función pura que resuelva la caja activa: la recordada en el equipo, si no la predeterminada, si no la única abierta.
3. Recordar la elección por equipo y sucursal. Caja y POS usan la misma.
4. Mostrar en el POS en qué caja se cobra y permitir cambiarla si hay más de una abierta.
5. Revisar todos los usos de `session` en el shell: POS, avisos, inicio y notificaciones.

La API ya valida cada sesión por separado, así que no se esperan cambios de backend.

### Etapa 3: datos de sesión y egresos (`feature/SISTEMA-39`)

1. Agregar a `summarizeSessions` los totales de tarjeta y transferencia, incluidos los cobros pendientes incorporados.
2. Exponer una línea de tiempo de la sesión con movimientos y cobros en efectivo, solo para sesiones abiertas.
3. Calcular la categoría de cada movimiento desde su concepto (vuelto, cuenta corriente, cobro asignado, anulación, nota de crédito, manual), aceptando textos viejos y nuevos. Permite mostrar ventas netas de vuelto.
4. Extraer el cálculo del esperado de `close()` a un método privado y reutilizarlo para bloquear egresos manuales que lo superen, bajo el mismo `lockCashSession`.
5. Resolver el reintento con `clientOperationId` antes de esa validación, para que repetir un egreso ya registrado no falle.
6. Agregar la regla nueva a `BUSINESS_RULES.md`.

La categoría se deriva del texto para evitar una migración. Si aparecen más orígenes de movimiento, conviene reemplazarla por una columna.

### Etapa 4: rediseño (`feature/SISTEMA-40`)

1. Mover `Cash` de `workspace-shell.tsx` a `apps/web/src/cash-workspace.tsx`.
2. **Barra de estado:** selector de caja con el estado de cada una, responsable y aviso de cobros pendientes con cantidad y total.
3. **Pestaña Sesión con la caja cerrada:** último cierre y formulario de apertura, con el botón "Usar último contado".
4. **Pestaña Sesión con la caja abierta:** Esperado, Efectivo, Tarjeta y Transferencia; línea de tiempo con conceptos legibles; movimiento manual y cierre.
5. **Pestaña Historial:** fechas de 30 días visibles, filtro por caja, Faltante y Sobrante diferenciados, y filtros que aplican de la misma forma.
6. Avisar antes de cerrar si la caja tiene cobros pendientes asignados.
7. Mostrar en verde el recuadro de cierre sin diferencia.
8. Comprobar la pantalla a 390 px y actualizar `CASH_WORKSPACE.md`.

## Coordinación

`workspace-shell.tsx`, `lib/api.ts` y `BUSINESS_RULES.md` son archivos calientes: avisar al otro desarrollador en las etapas que los tocan. Cada etapa se cierra con la skill `cerrar-tarea` y se prueba en local, nunca en producción.
