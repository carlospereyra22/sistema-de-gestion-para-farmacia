# Plan para Claude Code · Rediseño de Ventas (Propuesta E + ventana de cobro)

> Repositorio: `carlospereyra22/sistema-de-gestion-para-farmacia` (base: `main@5decf6e`, 01/11/2026).
> Rama: `feature/SISTEMA-16`. Tarjeta: https://trello.com/c/fNXr9DpI
> Referencia visual: `Ventas-Propuesta-E-mix.png` en esta carpeta. `Venta-actual-panel.png` y `Ventas-Ventana-de-cobro.png` todavía no se agregaron.
> Design system (sólo para humanos): “Sistema de Gestión” en claude.ai, grupo _Ventas_.

---

## 0. Cómo trabajar (leé esto primero)

1. Leé `AGENTS.md` y estas skills de `.agents/skills/`: `nueva-funcionalidad-web`, `cerrar-tarea` y `git-equipo`. Sus reglas mandan sobre este plan.
2. Trabajá en una rama `feature/SISTEMA-<N>`, con el N de la tarjeta de Trello o el siguiente libre según `git branch -a`. Los commits empiezan con `SISTEMA-<N>`. Nunca trabajes en `main`.
3. Este cambio toca `apps/web/src/workspace-shell.tsx`, que es un **archivo caliente**. Recordale al usuario que avise a su compañero.
4. **Trabajá por fases (sección 4).** Al terminar cada fase:
   - corré `pnpm --filter @gestion/web test` y `pnpm --filter @gestion/web typecheck`;
   - mostrá un resumen corto;
   - **esperá el OK del usuario** antes de seguir con la siguiente.
5. **No cambies la API ni las reglas de negocio.** El backend es la autoridad sobre precios, stock, pagos y comprobantes. Todo lo que se calcula en la web (vuelto, montos rápidos, descuento en %) es vista previa.
6. Textos de interfaz en español rioplatense, con voseo y coherentes con los que ya existen. Nada de emoji ni signos de exclamación.

---

## 1. Qué hay hoy (mapa del código)

Todo Ventas vive en `function Sales(...)` de `apps/web/src/workspace-shell.tsx` (desde ~L3710).

| Qué                           | Dónde (aprox.)                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado del cobro              | `lines`, `payments`, `method`, `paymentAmount`, `customerId`, `salePriceListId`, `discountMinor`, `documentType`, `fiscalOptions`, `submitting`, `clientOperationId`                                                                                                |
| Cálculos                      | `available()` L3958, `expiredStock()` L3965, `subtotal` L3972, `total` L3989, `matchingProducts` L3991, `keyboardProducts` L3998, `paid` / `changeMinor` L4145                                                                                                      |
| Acciones                      | `addProductToSale` L4016, `updateLineQuantity` L4073, `applyDiscount` L4106, `addPayment` L4159, `removePayment` L4196, `selectPaymentMethod` L4203, `complete` L4321                                                                                               |
| Atajo F2 y teclado a buscador | ~L4240–4275 (`shouldRouteSalesSearchKey` en `lib/sales-search-key.ts`)                                                                                                                                                                                              |
| Layout de 3 columnas          | JSX `sales-layout` ~L4514–5366 (búsqueda, carrito y `<aside className="sales-checkout">`)                                                                                                                                                                           |
| Ventana de cobro **sin uso**  | ~L5367–5612. `paymentModalOpen` **nunca se pone en `true`**. Sirve de base.                                                                                                                                                                                         |
| Ventana “venta confirmada”    | `receipt` + `sale-confirmed-title` ~L5616 (se abre después de `complete`)                                                                                                                                                                                           |
| Estilos                       | `apps/web/src/index.css`: `.sales-*` ~L1210–1290, ~L1495–1600 y el bloque “V2 visual system” ~L1062                                                                                                                                                                 |
| Tests de layout               | `apps/web/src/notebook-layout.test.tsx` (verifica selectores `.sales-*` y cortes)                                                                                                                                                                                   |
| Componentes que se reutilizan | `SaleQuantityInput`, `SaleProductPricing` (precio + descuento por línea con **% / $**), `ProductThumbnail`, `SearchableSaleSelect`, `SaleDocumentChoice`, `SaleFiscalSettings`, `SaleConceptMenu` / `SaleConceptDialog`, `DiscountAmountInput`, `DirectTicketPrint` |
| Stock bajo                    | Hoy es ≤ 5 unidades: está fijo en `product-catalog-header.tsx` y es el default de `notification-bell.tsx`                                                                                                                                                           |

---

## 2. Diseño objetivo (Propuesta E)

### 2.1 Layout

- `.sales-layout` pasa a **2 columnas**:
  ```css
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  ```
  El gap es de 12px (10px por debajo de 1800px). Se mantiene la altura actual: `max(620px, calc(100dvh - 106px))`, y su variante por debajo de 1800px.
- **Izquierda** (catálogo, ~45%), en columna con gap de 10px:
  1. buscador y filtros;
  2. tabla de catálogo (`flex: 1`, con scroll interno);
  3. detalle del producto elegido;
  4. línea de atajos.
- **Derecha:** el panel **Venta actual** a toda la altura (~55%). Es el protagonista.
- **Responsive:**
  - Entre 1024 y 1199px: se oculta la columna Categoría y el detalle queda en una sola fila.
  - Debajo de 1024px: se apila (catálogo arriba, venta abajo) y _Cobrar_ queda fijo al pie (`position: sticky; bottom: 0`).
  - Nunca puede aparecer scroll horizontal ni usarse `zoom`.

### 2.2 Buscador y filtros (izquierda, arriba)

- Usá el **mismo input** de hoy (`productSearchRef`) con alto `h-11`, borde `border-teal-400`, ícono `Search` a la izquierda, `ScanBarcode` a la derecha y un `<kbd>F2</kbd>`.
  - Placeholder: “Escaneá o buscá por nombre, droga o código”.
  - El lector sigue entrando por este mismo campo: **no** agregues un segundo input.
- Al lado van dos filtros:
  - **Categoría:** un `SearchableSaleSelect` con `product.category?.name` y la opción “Todas”.
  - **Con stock:** un toggle con `aria-pressed`, **apagado por defecto**. Encendido, oculta los productos con stock vendible 0.

### 2.3 Tabla de catálogo

- Va en una tarjeta blanca con borde, con `<table>` y `table-layout: fixed`.
- Encabezado sticky: `bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500`.

| Columna   | Ancho               | Contenido                                                                                                                                                                                                                                                                        |
| --------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Producto  | resto               | Nombre en `font-medium`, truncado. Debajo, `text-[11px] text-slate-500`: droga · concentración · forma (lo mismo que hoy), o “Sin detalle farmacéutico”. Si `available = 0`, la segunda línea dice “N vencidas · no vendibles” en `text-rose-600` y la fila va con `opacity-75`. |
| Categoría | 128px               | Chip `rounded-full bg-slate-100 px-2 h-[22px] text-[11px] font-medium text-slate-600` con `category.name`, o “—” si no tiene.                                                                                                                                                    |
| Stock     | 76px, a la derecha  | Si es 0: chip “Sin stock” (`bg-slate-100 text-slate-600`). Si es ≤ `LOW_STOCK_UNITS`: punto de 7px `#f6ac43` + número `font-semibold text-amber-700`. Si no, el número solo.                                                                                                     |
| Precio    | 124px, a la derecha | `font-semibold tabular-nums whitespace-nowrap`, con `money(prices[0].amountMinor)`.                                                                                                                                                                                              |

- **Fila elegida:** `bg-teal-50/60 shadow-[inset_3px_0_0_#0d9488]`, la misma clase que usan `customers-workspace.tsx` y `suppliers-workspace.tsx`. Con `aria-selected`.
- **Interacción** (reutilizá `highlightedSuggestionIndex` y `keyboardProducts`):
  - ↑ / ↓ mueven la selección.
  - **Enter** agrega la fila elegida con la cantidad del detalle.
  - **Doble clic** agrega 1.
  - **Esc** limpia la búsqueda y la selección.
  - Un clic sólo elige.
  - Después de agregar, el foco vuelve al buscador, como hoy.
- Los productos sin stock se pueden elegir para ver el detalle, pero **no se pueden agregar**.
- Accesibilidad: `role="grid"` o tabla con `aria-label="Catálogo de productos"`. Las filas son navegables y el nombre accesible incluye nombre, stock y precio.

### 2.4 Detalle del producto elegido

- Es una tarjeta de una sola fila con:
  - `ProductThumbnail` de 64px;
  - el nombre (15px, semibold, truncado);
  - una línea `text-[11px]` con “droga · forma · código · N disponibles”;
  - el precio (17px, bold, `text-teal-800`);
  - un stepper de cantidad, reutilizando el estilo `.sale-quantity-stepper`.
- Acciones a la derecha:
  - **Agregar** `<kbd>Enter</kbd>`: botón **con borde de marca**, no relleno, porque el único primario de la pantalla es _Cobrar_. Clases: `border border-[#0f9b8e] text-[#087f70] bg-white rounded-[0.65rem] font-semibold h-10`.
  - **Limpiar** `<kbd>Esc</kbd>`: botón secundario.
- Si no hay nada elegido: “Elegí un producto de la lista o escaneá un código.”
- Debajo de la columna, en una línea de atajos `text-xs text-slate-500`: “Doble clic o Enter agrega · **F2** buscar · **+ / −** última línea · **Ctrl + Enter** cobrar”.

### 2.5 Panel “Venta actual” (protagonista)

- Va en una tarjeta `rounded-2xl` con `shadow-sm`, en columna:
  1. **Encabezado:**
     - ícono `ShoppingCart` dentro de un cuadrado de 40px `rounded-[11px] bg-[#e8faf5] text-[#087f70]`;
     - el título “Venta actual” (18px, semibold);
     - el subtítulo “N productos en el carrito · M unidades” (o “Agregá productos para comenzar”);
     - a la derecha, el botón **Vaciar venta**, con la misma lógica que hoy: limpia líneas, pagos y opciones fiscales y devuelve el foco al buscador.
  2. **Contexto:** grilla `1.2fr 1fr` con **Cliente** y **Lista de precios**, con etiqueta visible y `h-[38px]`. Se reutilizan los `SearchableSaleSelect` y los `onChange` actuales: cambiar el cliente sigue limpiando la lista y los pagos, y cambiar la lista sigue limpiando los pagos. El aviso `pricingError` con “Reintentar” queda debajo.
  3. **Tabla de líneas, con las mismas columnas que hoy:**
     - Producto (thumbnail de 44px + nombre semibold + “N disponibles”);
     - Cantidad (stepper actual con `SaleQuantityInput`);
     - Precio unit.;
     - **Descuento** (`SaleProductPricing`, con su selector **% / $**);
     - Subtotal (bold);
     - Quitar.

     Grid: `minmax(0,1fr) 92px 104px 96px 104px 28px`, con gap de 10px. Los conceptos manuales (`line.description`) se ven igual que hoy (ícono `ReceiptText`, “Concepto · Sin movimiento de stock”). La **última línea agregada** lleva `bg-teal-50` y la píldora “Recién agregado” (`text-[10px] font-semibold bg-teal-50 text-teal-800 rounded-full`).

  4. **Pie** (`bg-slate-50`, borde arriba):
     - **Total de ítems**: “M unidades”.
     - **Descuento general**: un segmentado **% / $** + input. Con **$** usa la lógica actual (`DiscountAmountInput` + `applyDiscount`). Con **%**, convertí el porcentaje a centavos con una función pura (sección 3) y llamá al mismo `applyDiscount`, porque al backend le sigue llegando un importe. Enter aplica y Esc cancela, como hoy.
     - **Total a cobrar**: es el **único monto grande de la pantalla**, en 32px, bold, `tracking-tight`, `tabular-nums` y `text-[#087f70]`.
     - Botón **Cobrar** `<kbd>Ctrl + Enter</kbd>` a todo el ancho, `min-h-14 text-lg`, primario (`bg-teal-700`, que el bloque V2 ya pinta `#087f70`). Deshabilitado si no hay líneas, si `!pricingReady` o si `submitting`. Abre la ventana de cobro.

- **Se elimina** la columna de cobro actual (`<aside className="sales-checkout">`) y los totales repetidos: “TOTAL A PAGAR”, el resumen “Total / Pagado / Pendiente” y el “Total a cobrar” del pie viejo.

### 2.6 Encabezado de la página

- Agregá una pastilla de caja en `workspace-sales-actions`, antes de _Historial_:
  - **Con sesión:** “Caja abierta”, con un punto en `bg-emerald-50 text-emerald-700 rounded-full h-7 px-2.5 text-xs font-semibold`. Si la sesión expone un nombre o número de caja, usalo (“Caja 1 abierta”); si no, dejá el texto genérico.
  - **Sin sesión y con `allowWithoutSession`:** pastilla amber, “Sin caja · el cobro queda pendiente”.
  - **Sin sesión y sin permiso:** pastilla rose, “Sin caja abierta”.

### 2.7 Ventana de cobro (`sale-checkout-dialog.tsx`)

- Partí del modal muerto (~L5367–5612) y moverlo a su propio archivo.
- **Estructura:**
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby`;
  - velo `fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-sm` (igual que hoy);
  - caja `max-w-[720px] rounded-2xl border border-slate-200 bg-white shadow-2xl`.
- **Al abrir:**
  - si no hay pagos cargados, el campo **Recibido** se precarga con el saldo;
  - el foco va al campo, con el texto seleccionado.
- **Encabezado:** “Cobrar venta”, el subtítulo “N productos · M unidades · {cliente} · {lista}” y el botón **Volver** `<kbd>Esc</kbd>`.
- **Columna izquierda (230px):**
  - “Medio de pago” como lista vertical de opciones de 48px, con ícono en un cuadrado de 30px y `<kbd>` 1–4: Efectivo, Tarjeta, Transferencia y Cuenta corriente.
    - Opción activa: `border-teal-600 bg-teal-50 text-teal-800 ring-1 ring-teal-600`.
    - Las teclas 1–4 eligen el medio **sólo si el foco no está en un input**.
    - Cuenta corriente sólo se habilita con `creditAccount?.active && creditAccount.creditEnabled`. Si no, aparece apagada con la ayuda “Cuenta corriente: elegí un cliente con cuenta habilitada.”
  - Debajo, “Comprobante”: reutilizá `SaleDocumentChoice` (Ticket / Factura y el menú de configuración fiscal).
- **Columna derecha:**
  1. **Caja de total** (`bg-slate-50 rounded-xl`): “Total a pagar” y el monto en 32px, bold, `text-[#087f70]`; debajo, “Subtotal $ X · Descuento $ Y”.
  2. Si hay pagos parciales, una **barra** `h-1.5 bg-slate-100` con relleno `#087f70` y la línea “Pagado $ X” (teal) / “Resta $ Y” (`text-rose-700`).
  3. Si hay pagos agregados, una lista **Pagos** con ícono, medio, importe y botón quitar (`removePayment`).
  4. El campo **Recibido** (o “Efectivo recibido · resta $ Y”, según el medio): `h-14 text-2xl font-semibold`, prefijo `$`, ayuda “Enter confirma”. Parseo igual que hoy (`5.000`o`5.000,00`).
  5. **Montos rápidos** (sólo en efectivo): chips “Exacto” + 2 o 3 redondeos hacia arriba (sección 3).
  6. **Vuelto a entregar**: recuadro sky, como el “Cambio a entregar” de hoy (`border-sky-200 bg-sky-50`, monto `text-sky-700 text-2xl font-bold`), con `aria-live="polite"`. Sólo aparece en efectivo, cuando el recibido supera el saldo.
  7. El enlace **Dividir en otro medio de pago**: agrega el importe actual como pago (`addPayment`), cambia el medio y precarga lo que resta.
- **Pie:**
  - el aviso de caja si corresponde (`bg-amber-50 text-amber-800`, con los textos de hoy);
  - **Volver** `<kbd>Esc</kbd>`;
  - **Confirmar venta** `<kbd>Enter</kbd>`, primario, `min-h-12`.
- **Confirmar:**
  - si el campo tiene un importe y todavía no cubre el saldo con los pagos agregados, primero agregalo como pago y después llamá a `complete()`;
  - evitá depender del `setState` asíncrono: armá la lista final de pagos y pasala a `complete` (por ejemplo, `complete(paymentsOverride?)`);
  - mantené **las validaciones actuales** de `complete`, `addPayment` (sólo el efectivo puede superar el saldo) y el mismo `clientOperationId` en los reintentos.
- **Errores:**
  - se muestran **dentro** de la ventana (`role="alert"`), sin cerrarla;
  - si el resultado es incierto (red o 500), se bloquea la edición y se ofrece reintentar la misma solicitud, como pide la skill `nueva-funcionalidad-web`.
- **Venta confirmada:** reemplazá la ventana actual de `receipt`. Es la misma ventana, en otro estado (`max-w-[560px]`):
  - un ícono check en un círculo `bg-emerald-50 text-emerald-700`;
  - el título “Venta confirmada”;
  - la línea “$ total · medio · Ticket enviado a la impresora” (si es factura: “Factura en proceso”, con el flujo actual de `invoiceDialog`);
  - el recuadro **Vuelto a entregar** en grande (si hubo efectivo de más), con la línea “Recibido $ X en efectivo”.
  - Botones:
    - **Reimprimir**: usa `printReceipt` / `setTicketSaleId`;
    - **Ver venta**: va al historial o al detalle existente;
    - **Nueva venta** `<kbd>Enter</kbd>`, primario: cierra, deja la venta vacía y devuelve el foco al buscador.
  - La impresión automática del ticket se mantiene como hoy.
- **Esc** vuelve a la venta sin perder líneas ni pagos. La ventana no se cierra con un clic en el velo mientras `submitting`.

### 2.8 Atajos (resumen)

| Tecla                            | Acción                                                   | Estado                           |
| -------------------------------- | -------------------------------------------------------- | -------------------------------- |
| F2                               | Enfocar el buscador                                      | Ya existe: se mantiene           |
| Escribir en cualquier lugar      | Empieza una búsqueda                                     | Ya existe: se mantiene           |
| ↑ / ↓ · Enter · doble clic · Esc | Navegar, agregar y limpiar en el catálogo                | Nuevo, sobre la lógica existente |
| + / −                            | Sumar o restar 1 a la **última línea** (fuera de inputs) | Nuevo                            |
| Ctrl + Enter                     | Abrir el cobro / confirmar dentro de la ventana          | Nuevo                            |
| 1–4                              | Medio de pago dentro de la ventana (fuera de inputs)     | Nuevo                            |
| Esc                              | Cerrar la ventana / limpiar la selección                 | Nuevo                            |

No uses F5, F11 ni F12, ni atajos con Alt. Todos los atajos se bloquean con las mismas condiciones que hoy: venta inactiva, `resumeNeeded`, `submitting`, modal abierto o menú de cuenta abierto.

---

## 3. Lógica pura nueva (`apps/web/src/lib/`, cada una con su `*.test.ts`)

- `sale-quick-amounts.ts`
  - `quickCashAmounts(dueMinor): number[]` devuelve el exacto + los siguientes redondeos útiles (múltiplos de 1.000, 5.000, 10.000, 20.000 y 50.000), sin duplicados y como máximo 4. Ejemplo: 17.070 → `[17.070, 18.000, 20.000, 50.000]`.
  - `changeMinor(receivedMinor, dueMinor)`.
- `sale-discount-percent.ts`
  - `percentToDiscountMinor(percent, subtotalMinor)` redondea a centavos. Rechaza valores < 0, > 100 o no numéricos, y acepta coma decimal. Reutilizá los parsers de `lib/sale-discount.ts` / `lib/product-discount.ts` si sirven.
- `sales-shortcuts.ts`
  - Clasifica teclas (Ctrl+Enter, +, −, 1–4) con las mismas guardas que `lib/sales-search-key.ts` (no actuar en inputs editables).
- `stock-level.ts`
  - Exporta `LOW_STOCK_UNITS = 5` y `stockLevel(available): "out" | "low" | "ok"`.
  - Usalo también en `product-catalog-header.tsx`, para no duplicar el 5.

---

## 4. Fases (un commit por fase y OK del usuario entre fases)

### Fase 1 · Lógica pura

- Crear los 4 módulos de la sección 3 con sus tests.
- **Listo cuando:** pasan los tests nuevos y los existentes.

### Fase 2 · Catálogo y detalle

- Crear `sale-catalog-table.tsx` y `sale-product-detail.tsx`, con sus tests (`renderToStaticMarkup`, como `sale-quantity-input.test.tsx`).
- Reemplazar la lista “Resultados” del shell por estos dos componentes, sin cambiar todavía el grid.
- **Listo cuando:**
  - el foco vuelve al buscador después de agregar;
  - el lector sigue agregando directo;
  - los sin stock no se pueden agregar.

### Fase 3 · Panel Venta actual

- Crear `sale-current-panel.tsx`, con su test. Mover el JSX del carrito, Cliente / Lista, el pie y _Cobrar_.
- Agregar el descuento general en % / $.
- **Listo cuando:**
  - los totales coinciden con los de hoy;
  - aplicar un descuento en % o $ da el mismo `discountMinor` que su equivalente en $;
  - “Recién agregado” marca la última línea.

### Fase 4 · Ventana de cobro

- Crear `sale-checkout-dialog.tsx`, con su test, desde el modal muerto. Conectar _Cobrar_. Ajustar `complete` para aceptar la lista final de pagos.
- **Listo cuando:**
  - efectivo exacto = Cobrar → Enter;
  - efectivo con vuelto muestra el vuelto correcto;
  - el pago dividido funciona;
  - cuenta corriente sólo aparece con un cliente habilitado;
  - los errores no cierran la ventana;
  - Esc vuelve sin perder nada.

### Fase 5 · Venta confirmada

- Convertir la ventana de `receipt` en el estado “Venta confirmada”, dentro del mismo componente o en `sale-confirmed.tsx`.
- **Listo cuando:**
  - se ve el vuelto;
  - Reimprimir y Nueva venta (Enter) funcionan;
  - la impresión automática no cambió.

### Fase 6 · Layout, estilos y encabezado

- Grid de 2 columnas, cortes responsive, pastilla de caja y eliminación de `<aside className="sales-checkout">` y de sus reglas `.sales-checkout*` en `index.css`.
- Actualizar `notebook-layout.test.tsx` a los nuevos selectores y cortes.
- **Listo cuando:**
  - no hay scroll horizontal en 1920, 1536, 1366, 1280 y 1024px;
  - _Cobrar_ siempre está visible y mide ≥ 44px.

### Fase 7 · Docs y cierre

- Actualizar `docs/WORKSPACE.md` (la sección Ventas pasa de 3 a 2 columnas, con los nuevos cortes y atajos).
- Actualizar `docs/SALES_QUANTITY_INPUT.md` (atajos) y `docs/SALES_DISCOUNTS_CUSTOMERS.md` (descuento general en %).
- Agregar en `docs/DECISIONS.md` la entrada “Rediseño de Ventas: catálogo + Venta actual protagonista y ventana de cobro (DD/MM/AAAA)”.
- Seguir la skill `cerrar-tarea`: `pnpm format`, `lint`, `typecheck`, `test` y `build`, y el informe final.

---

## 5. Fuera de alcance

- Cambios de API, Prisma o contratos.
- Nuevos medios de pago, cuotas o recargos.
- Cambios en la impresión térmica o en ARCA.
- Rediseño de otras pantallas.
- Modo oscuro.
- Reescribir `workspace-shell.tsx` por completo: sólo cambian el mínimo necesario y las piezas que se extraen a archivos propios.
- Pendiente de definir: crear un cliente desde Ventas (idea de la tarjeta de Trello, no está en este plan).

## 5 bis. Cambios acordados durante la implementación (01/11/2026)

- Columnas iguales (`1fr 1fr`) en lugar de 0.86 / 1.14, para que entren los filtros.
- Pie de Venta actual en una sola fila (descuento, total y Cobrar) para dar más alto a las líneas.
- Ventana de cobro con alto fijo (580 px) y 700 px de ancho; Exacto a la derecha del importe; el importe se formatea al escribir (`1000` → `1.000,00`).
- «Dividir en otro medio de pago» se reemplazó por un aviso «Faltan $ X. ¿Con qué medio se completa?» con botones por medio. Enter con importe parcial registra el pago y precarga el resto.
- Venta confirmada: Imprimir ticket es la acción principal y, al imprimir, Nueva venta pasa a serlo (Enter, Enter). Vista previa del ticket a pedido y X para cerrar. Se conserva el comprobante interno. No hay impresión automática (tampoco la había antes).
- La pastilla de caja dice «Caja abierta» porque la sesión no expone nombre ni número de caja.
- Fuera de alcance por ahora: crear un cliente desde Ventas (idea de la tarjeta de Trello).

## 6. Validación manual (para el informe final)

- [ ] Recorrido completo con el **lector físico**: escanear, cantidad, escanear desde el campo cantidad, cobrar y confirmar.
- [ ] Efectivo exacto, efectivo con vuelto, tarjeta, transferencia, pago dividido y cuenta corriente con un cliente habilitado.
- [ ] Ticket y Factura (homologación). Sin caja abierta, con y sin `allowWithoutSession`.
- [ ] Error de red al confirmar: la ventana no se cierra y el reintento usa el mismo `clientOperationId`.
- [ ] Navegación sólo con teclado (F2, ↑↓, Enter, + / −, Ctrl + Enter, 1–4, Esc).
- [ ] Viewports de 1920×1080, 1536×864, 1366×768, 1280×720 y 1024×768, ventana menor a 1024px y zoom del navegador al 125%.
- [ ] Nombres largos de productos y clientes, importes grandes y 15 o más líneas en la venta.
