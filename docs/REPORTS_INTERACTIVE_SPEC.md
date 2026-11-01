# PROMPT MAESTRO PARA CODEX — MÓDULO DE REPORTES INTERACTIVOS TIPO POWER BI

**Proyecto:** Sistema de gestión de Farmacia Juncos  
**Objetivo:** implementar un módulo de reportes profesional, interactivo, gratuito y completamente integrado al software existente.  
**Idioma de la interfaz:** español (Argentina).  
**Moneda:** pesos argentinos, ARS.  
**Zona horaria de negocio:** `America/Argentina/Cordoba` o la zona horaria configurable de la sucursal; respetar la que ya usa el sistema.  
**Referencias visuales:** las 7 imágenes generadas que adjuntaré junto con este archivo: Resumen, Ventas, Rentabilidad, Productos, Inventario, Compras/Proveedores y Clientes/Cuentas Corrientes.

---

## 0. INSTRUCCIÓN PRINCIPAL: NO QUIERO UN MOCKUP, QUIERO EL MÓDULO FUNCIONAL

Trabajá directamente sobre el repositorio del sistema. Tu misión es **desarrollar, integrar, probar y dejar operativo** un módulo `Reportes` comparable en experiencia visual e interacción a Power BI, pero implementado con herramientas libres y conectado a la base de datos real del negocio.

Los gráficos y tablas deben alimentarse de los movimientos existentes del sistema, NO de números ficticios. Las imágenes son referencias de **diseño, composición, tipografía, colores y tipos de visualización**, no fuentes de valores de negocio. NO copies sus cifras de ejemplo, fechas de 2025, sucursales inventadas ni su etiqueta monetaria `MXN` (la aplicación está en Argentina y usa ARS).

**No entregues únicamente un documento, un prototipo, capturas estáticas o componentes sin conexión. Implementá código real y navegable.** Si encontrás diferencias entre estas instrucciones y el repositorio, estudiá el código y adaptate a su arquitectura; no inventes modelos ni cambies módulos existentes a ciegas.

### Condiciones no negociables

1. **No romper funcionalidades existentes:** POS, ventas, devoluciones, compras, recepción parcial, stock/lotes, vencimientos, clientes/cuentas corrientes, proveedores, caja, listas de precios, usuarios, permisos, impresión, facturación electrónica/ARCA y sucursales deben seguir funcionando.
2. **No reescribir el proyecto ni migrar el stack.** Aprovechar su arquitectura, componentes visuales, autenticación, rutas, API y servicios existentes.
3. **No servicios de BI pagos, licencias Power BI ni claves comerciales.** Preferencia: `Apache ECharts` (Apache-2.0) para visualizaciones. Para React, usar ECharts directamente o un wrapper compatible y libre; revisar versiones/licencias del proyecto antes de instalar. También se permiten bibliotecas open source para tablas, filtros y exportación si son realmente necesarias.
4. **Seguridad y aislamiento:** un usuario jamás puede consultar reportes de sucursales u organizaciones que no tiene autorizadas. Los filtros del frontend NO reemplazan validación y autorización de backend.
5. **Datos reales y cálculos trazables:** si faltan datos para una métrica, mostrar "No disponible" / "Datos históricos insuficientes" / "Sin datos para el período" y documentar la causa. No inventar costos, stock histórico, devoluciones, cobros, margen ni métricas.
6. **Misma estética del sistema:** mantener la identidad visual y los componentes actuales. El título `Reportes` debe aparecer en la barra superior, como el resto de los módulos. **No duplicar un título enorme debajo**. El encabezado interior debe ser compacto y funcional.
7. **Escritorio prioritario, responsive real:** perfectamente usable en pantallas habituales de PC y tablet; en móvil, apilar elementos sin cortar textos ni tablas; usar scroll horizontal donde corresponda.
8. **Nada de SQL concatenado con parámetros del usuario;** utilizar consultas parametrizadas y la capa ORM/SQL ya establecida. No permitir construir SQL arbitrario desde el navegador.
9. **No borrar ni modificar datos productivos de forma destructiva.** Toda migración necesaria debe ser revisable, reversible cuando corresponda y compatible con la base existente.
10. **Verificar que se pueda ejecutar en el despliegue actual**, con consumo razonable de CPU/RAM en hosting económico o gratuito.

---

## 1. PRIMERO: RECONOCIMIENTO DEL REPOSITORIO (OBLIGATORIO)

Antes de escribir componentes o endpoints, inspeccioná y registrá:

- Frontend real: framework, versión, router, sistema de diseño, librería de íconos, componentes `Card`, `Tabs`, `Table`, `Select`, `DatePicker`, `Dialog`, `Skeleton`, `Toast`, tablas y sistema de consultas/caché.
- Backend real: si es NestJS, convenciones de módulos/controladores/servicios, validación, DTO, interceptores, rutas, paginación, autenticación, permisos y autorización multi-sucursal.
- Base real: PostgreSQL, ORM/migraciones, nombres reales de tablas, relaciones, índices, claves de sucursal/organización y restricciones de permisos.
- Modelos y movimientos de: ventas, ítems de venta, descuentos, pagos múltiples, anulaciones, devoluciones, ventas de cuenta corriente, clientes, cobros, movimientos de cuenta corriente, productos, categorías, laboratorios, costos históricos, compras, renglones, recepciones, lotes, vencimientos, inventario, proveedores y sucursales.
- Cómo se asigna el costo de un producto al vender, cómo se descuenta el stock y cómo se representan presentaciones distintas (caja, blíster, unidad). Identificá correctamente la **unidad de stock**.
- Cuáles datos permiten cálculos confiables y cuáles no están registrados históricamente.
- Cómo se carga el título superior en los demás módulos: replicar ese patrón.
- Herramientas de testing, lint, build y scripts existentes.

**Entregá/registrá un pequeño mapa de las entidades y fuentes de cada métrica**, con nombre real de archivo/tabla/campo. Si hay ambigüedades, elegí la interpretación segura, explicala, y hacé visible cualquier limitación de los datos; no detengas todo el trabajo por un detalle opcional.

Reutilizá código ya disponible y evitá introducir dependencias innecesarias. Todo lo indicado a continuación es una especificación funcional adaptable al repositorio, NO una invitación a suponer que existen los nombres de tablas o rutas que aquí se mencionan.

---

## 2. ARQUITECTURA DESEADA

### Frontend

Integrar bajo el módulo de navegación `Reportes`, con **7 pestañas**:

1. `Resumen`
2. `Ventas`
3. `Rentabilidad`
4. `Productos`
5. `Inventario`
6. `Compras`
7. `Clientes`

Un mismo layout/contendor de reportes debe concentrar:

- Controles globales de fecha (cuando aplique), sucursal y exportación.
- Pestañas compactas y consistentes.
- Estado de filtros globales, filtros locales, filtros cruzados de gráficos y botón `Limpiar filtros`.
- Componentes reutilizables: `ReportKpi`, `ReportFilters`, `ReportChart`, `ReportTable`, `ReportEmptyState`, `ReportErrorState`, `ReportToolbar`, `ReportDateRange`, `ComparisonSelector`, `DrilldownDrawer`.
- Carga con skeleton coherente, error recuperable y ausencia de datos claramente explicada.
- Separación por página para evitar un archivo gigante y renderizar únicamente la pestaña activa.

### Backend

Crear un módulo/servicio de analítica/reportes siguiendo el patrón existente, con:

- Controladores y DTO de filtros validados.
- Servicios de agregación que usan la lógica/fuentes correctas del negocio.
- Consultas eficientes a PostgreSQL ejecutadas en el servidor.
- Endpoints para datasets, catálogos de filtros, detalles paginados y exportaciones.
- Capa común de autorización por organización/sucursal.
- Transformadores de respuestas que devuelvan valores tipados (números, fechas ISO, identificadores), NO valores monetarios formateados.
- Cálculos consistentes entre tarjetas, gráficos, tablas y exports.

### Librerías

- Gráficos: `echarts` (Apache-2.0), con carga modular de gráficos/componentes para reducir el bundle. Wrapper React libre solo si simplifica y es compatible.
- Tablas y controles: preferir lo que ya existe en el proyecto.
- Fetch y caché: preferir la solución actual (por ejemplo TanStack Query, si ya se utiliza).
- Exportar CSV/Excel/PDF: usar lo que exista o dependencias libres compatibles. No instalar plataformas externas.

No agregar contenedores ni servicios de BI independientes si ECharts y el backend actual resuelven la necesidad.

---

## 3. DISEÑO VISUAL (MUY IMPORTANTE)

**Seguir fielmente el estilo de las imágenes adjuntas, pero refinarlo para que parezca una aplicación empresarial real y no un dashboard genérico hecho con IA.**

### Jerarquía

- Barra superior actual: título `Reportes`, con ícono discreto y sin repetir un segundo título grande debajo.
- Primer renglón de contenido: pestañas horizontales (`Resumen`, `Ventas`, etc.), de altura compacta. Marcar la activa con estilo verde sobrio, no botones enormes.
- KPIs: **4 tarjetas compactas por fila en desktop**, con cifra principal clara, título corto, pequeño ícono dentro de círculo discreto, variación respecto al período anterior cuando sea válida y un tooltip explicativo de la fórmula.
- Filtros: una barra ordenada y reutilizable debajo de los KPIs, con elementos alineados y espacio razonable. No repetir selector de sucursal o fecha en dos lugares de manera innecesaria; determinar la ubicación correcta siguiendo la UI real.
- Gráficos: grilla equilibrada, con un gráfico principal amplio (por ejemplo 50%), secundarios medianos, tablas abajo y altura consistente por fila.
- Estados sin datos y alertas: sobrios. Priorizar información, no adornos.

### Estilo

- Fondo general blanco o gris muy claro, cards blancas.
- Verde corporativo existente para estados seleccionados, líneas, barras y énfasis.
- Borde fino, sombra muy suave, radios moderados. **Evitar sombras fuertes, gradientes excesivos, exceso de íconos y saturación de verde.**
- Tipografía y tamaño coherentes con el resto del software.
- Números legibles y alineados (usar dígitos tabulares donde sea posible).
- Positivos en verde SOLO si son favorables (ej.: bajar facturas vencidas). Aumentar costos, deudas o faltantes puede ser desfavorable y debe reflejarse correctamente.
- Tablas: encabezados suaves, padding profesional, separadores finos, alineación derecha de montos, tooltips para etiquetas largas, enlaces de detalle reales.
- Gráficos: leyendas simples, tooltips con números exactos, buena escala de ejes, no truncar nombres sin alternativa, colores accesibles.
- Formato argentino: `es-AR`, `ARS`, fechas `dd/MM/yyyy` o el formato que ya use el sistema, miles con punto y decimales con coma. **Nunca `MXN`.**
- Usar los textos de las imágenes como inspiración, pero reemplazar datos falsos y listas de sucursales por entidades efectivamente existentes.

### Responsive

- > = 1280 px: 4 KPIs, gráficos en grilla.
- 768–1279 px: 2 KPIs por fila y gráficos redistribuidos.
- < 768 px: una columna, filtros plegables, gráficos que se puedan leer, tablas con desplazamiento horizontal sin romper diseño.
- Respetar controles de teclado y accesibilidad; datos principales de gráficos disponibles en tablas/leyendas.

---

## 4. REGLAS COMUNES DE LOS FILTROS Y LA INTERACTIVIDAD

### Filtros globales y locales

- Fechas: hoy, ayer, últimos 7 días, últimos 30 días, este mes, mes anterior, este año y personalizado. **Por defecto últimos 30 días**, salvo preferencia de sistema ya existente.
- Sucursal: `Todas las sucursales autorizadas` o una sucursal permitida. Si el usuario ve una sola, no mostrar opciones inaccesibles.
- Comparar con: período anterior de igual duración, mismo período del año anterior cuando sea posible, desactivado.
- Según pestaña: categoría, laboratorio, proveedor, vendedor, tipo de cliente, estado de cuenta, depósito y medio de pago, si corresponden a entidades reales.
- Permitir combinar filtros con lógica AND coherente; filtros múltiples donde sea útil.
- Reflejar filtros activos con chips removibles y un botón para limpiarlos.
- Mantener los filtros relevantes al cambiar de pestaña; los no aplicables no deben producir comportamientos ocultos.
- Si el proyecto tiene routing adecuado, serializar el estado compartible en la URL, **sin incluir información sensible**.
- Debounce para búsquedas; evitar un request por pulsación sin necesidad.

### Interacción estilo Power BI

Implementar de verdad estas conductas:

1. **Tooltips:** al pasar el mouse mostrar dato exacto, período, unidad y porcentaje.
2. **Filtros cruzados:** al hacer clic en una categoría o medio de pago de un gráfico, actualizar otras visualizaciones compatibles dentro de la pestaña. Mostrar el filtro seleccionado con un estado visible y permitir quitarlo. No alterar métricas no relacionadas de manera errónea.
3. **Drill-down de tiempo:** año → mes → día; día → hora cuando haya datos. Mostrar breadcrumb y botón volver.
4. **Drill-down de producto/categoría:** categoría → productos → detalle de producto, aprovechando la ficha existente o un drawer de lectura.
5. **Drill-through a transacciones:** abrir una tabla/drawer paginada que explique de dónde salió una cifra, con link a venta, compra, producto o cliente si el usuario tiene permisos.
6. **Seleccionar y comparar:** permitir elegir un período de comparación y mostrar diferencias absolutas y porcentuales cuando la base anterior no sea cero.
7. **Persistencia moderada:** mantener selecciones al navegar entre reportes; permitir restaurar vista predeterminada.
8. **Descarga:** exportar la vista/tabla filtrada según los mismos criterios que muestra el usuario.

La interactividad se resuelve con el estado React + eventos de ECharts + datos agregados del backend. **No basta con que una gráfica tenga animación:** los clics deben filtrar o navegar realmente.

### Fechas y límites

- Filtrar por instante real de transacción y zona horaria comercial correcta; el día termina a medianoche local, evitando excluir registros de las 23:59.
- Preferir rangos técnicos semiabiertos `[inicio, fin)` para no duplicar movimientos.
- Validar fechas invertidas y rangos excesivos; devolver errores amigables.
- No permitir períodos fuera de la vida de la empresa y no mostrar comparaciones falsas cuando falta histórico.

---

## 5. DEFINICIONES DE NEGOCIO Y FÓRMULAS (NO IMPROVISAR)

**Aplicar las reglas reales del proyecto cuando existan; centralizar estas definiciones para que nunca haya una fórmula distinta por componente.** Documentar las variantes según su origen y disponibilidad de datos.

### 5.1 Ventas

- `Ventas brutas`: suma de importes de productos vendidos antes de descuentos/devoluciones, conforme a la definición existente.
- `Descuentos`: descuentos de línea + descuento global, evitando aplicarlos dos veces; distribuir descuentos globales proporcionalmente entre renglones si hace falta analizar categorías o producto.
- `Ventas netas`: ventas confirmadas válidas, descuentos aplicados y devoluciones/notas de crédito correctamente descontadas, siguiendo la semántica transaccional existente. Excluir presupuestos, ventas anuladas y operaciones no confirmadas.
- `Tickets`: cantidad de comprobantes/ventas confirmadas elegibles, no cantidad de renglones ni pagos. Determinar explícitamente cómo tratar tickets devueltos completamente.
- `Ticket promedio`: ventas netas / cantidad de tickets elegibles, evitando división por cero.
- `Unidades vendidas`: suma de cantidades físicas convertidas a una unidad comparable **solo si el sistema tiene equivalencias confiables**. Si no, usar cantidad por presentación y aclararlo.
- `Ventas por hora`: agrupar por hora local de confirmación, no por fecha de creación de borrador.
- `Ventas por medio de pago`: sumar importe realmente asignado a cada medio en cada venta, respetando los **pagos mixtos**. No atribuir el total del ticket a cada medio ni duplicar cobros de cuenta corriente como si fueran nuevas ventas. Diferenciar venta en cuenta corriente de cobro posterior.
- `Devoluciones`: tratarlas como importes negativos o apartadas en una métrica distinta según el modelo del sistema; no perder trazabilidad.
- `Ventas por sucursal/vendedor`: usar la sucursal y responsable reales guardados en la transacción, no la sucursal actual del usuario.

### 5.2 Rentabilidad

- `Costo de ventas (COGS)`: preferir **costo histórico asignado a los productos en el momento de la venta**, o el método de valuación que realmente aplica el sistema. No usar indiscriminadamente el costo actual para calcular ganancias de meses anteriores.
- `Ganancia bruta`: ventas netas elegibles menos costo de ventas neto de devoluciones, de acuerdo con la lógica real de impuestos y descuentos que se registre.
- `Margen bruto %`: `ganancia bruta / ventas netas × 100`; no confundir con markup sobre costo.
- `Markup %`: `(precio neto - costo) / costo × 100`, solo si se incluye explícitamente y etiquetado como distinto del margen.
- `Rentabilidad por ticket`: ganancia bruta / tickets elegibles.
- `Variación en puntos porcentuales (pp)`: margen actual menos margen anterior. No confundir con porcentaje de cambio relativo.
- `Margen por producto/categoría`: margen ponderado por importes, **no promedio simple de porcentajes de cada producto**.
- Si no existe costo histórico suficientemente confiable, mostrar ganancia/margen como **estimación identificada** o `No disponible`, informar qué datos faltan y no afirmar precisión contable.
- Mostrar `Ganancia bruta estimada`, no `ganancia neta`, si no se computan alquiler, sueldos, servicios, impuestos y gastos generales.

### 5.3 Productos y rotación

- `Top vendidos`: unidades, facturación o margen según selector claro; no mezclar unidades con facturación.
- `Sin movimiento`: productos activos con stock o catálogo relevante que no registraron ventas en N días. N configurable y visible (por defecto 30 o 60 según UX), respetando sucursal.
- `Rotación`: documentar fórmula seleccionada (por ejemplo unidades vendidas / stock promedio en el período); si falta stock histórico, usar una aproximación claramente rotulada o no mostrar.
- `Rotación vs margen`: gráfico de dispersión con ejes y tamaño de burbuja definidos en tooltip. Los cuadrantes deben tener umbrales explícitos configurables.
- `Participación por categoría`: categoría basada en la asignación real del producto y montos netos consistentes.

### 5.4 Inventario y vencimientos

- `Stock actual`: movimientos o saldo fuente de verdad del sistema; agrupar por producto/sucursal/lote sin duplicaciones.
- `Valor del stock`: unidades existentes × costo unitario de valuación definido por sistema (último costo, promedio ponderado u otro existente). Indicar en tooltip el método utilizado. **No presentarlo como valor de venta.**
- `Stock bajo`: comparar con mínimo configurado por producto/sucursal; si no existe, usar un criterio configurable y claramente señalado (no asumir `≤10` universalmente).
- `Sin stock`: productos activos cuyo saldo elegible es cero o inferior, respetando políticas de stock negativo.
- `Próximos a vencer`: lotes con existencia positiva cuya fecha cae dentro de la ventana seleccionada (por ejemplo 30/60/90 días). Separar `Vencidos` de `Por vencer`; no contar lotes sin stock.
- `Evolución histórica del stock`: **solo construirla con movimientos o snapshots suficientes para reconstruir fechas pasadas**. No inventar una curva histórica a partir del valor actual. Si no se puede reconstruir confiablemente, presentar stock actual y aviso de histórico no disponible hasta implementar snapshots.
- Las recepciones parciales deben afectar inventario solo por cantidades efectivamente recibidas, no por cantidades ordenadas.

### 5.5 Compras y proveedores

- `Compras totales`: establecer si el reporte analiza compras confirmadas/facturadas o mercadería recibida. **No mezclar pedido, factura y recepción** ni contar dos veces una misma operación; etiquetar correctamente cada métrica.
- `Facturas pendientes`: facturas reales a pagar según saldo después de pagos/notas de crédito, vencimiento y estado; no inferir deuda solo del valor de una compra.
- `Recepciones pendientes`: cantidad pedida menos cantidad recibida por cada renglón; contemplar recepciones parciales, cancelaciones y devoluciones.
- `Cambio de costo`: comparar costos de compra registrados en fechas reales, con unidad/presentación homogénea y sin dividir por cero.
- `Compras por proveedor/laboratorio`: la clasificación debe provenir de relaciones reales y consistentes.
- No sumar pagos a proveedores al cierre de caja si el sistema define cuentas corrientes por fuera de caja.

### 5.6 Clientes y cuentas corrientes

- `Clientes activos`: definición explícita (clientes habilitados o clientes que compraron en período), con etiqueta que corresponda.
- `Saldo en cuenta corriente`: saldo desde el libro de movimientos real de deuda, pagos, ajustes y notas de crédito. No sumar todo lo vendido si hubo pagos parciales.
- `Cobrado en el período`: cobros efectivamente registrados, excluyendo simples ventas a crédito que todavía no se cobraron.
- `Clientes con deuda`: cantidad con saldo positivo exigible o pendiente según regla del sistema.
- `Antigüedad de saldos`: 0–30, 31–60, 61–90, 91–120 y >120 días según vencimientos de deuda; **no usar automáticamente la fecha del último movimiento** para envejecer toda la deuda si hay documentos/facturas con diferentes vencimientos.
- `Top clientes por facturación`: ventas netas confirmadas imputadas a cada cliente, sin duplicar los cobros de cuenta corriente.
- Cualquier estadística de clientes debe cumplir permisos, y no revelar datos personales en pantallas o exportaciones a perfiles no habilitados.

### 5.7 Comparativas y números

- Variación porcentual = `(actual - anterior) / abs(anterior) × 100` solo cuando el denominador sea válido y esa fórmula tenga sentido para la métrica. Si el anterior = 0, mostrar `—` o `Sin base de comparación`, no `Infinity`.
- Evitar sumar importes de diferentes semánticas (neto/bruto, con IVA/sin IVA).
- Usar decimal/NUMERIC para dinero, no redondeos acumulados de float; redondear para presentación en el borde de la API/UI.
- Sumas de una tabla deben conciliar con sus KPIs cuando comparten rango/filtros/definición.
- Datos no confirmados o faltantes no deben contaminar gráficos.

---

## 6. PESTAÑA 1: RESUMEN GENERAL

**Referencia:** primera imagen de dashboard general.

### KPIs

1. **Ventas netas** del período.
2. **Ganancia bruta estimada** (solo si existe costo confiable; si no, estado explicativo).
3. **Ticket promedio**.
4. **Unidades vendidas**.

Cada KPI puede incluir comparación con período anterior, flecha/variación correcta y ayuda contextual.

### Gráficos y tablas

1. **Evolución de ventas** (línea/área) con actual y período anterior, granularidad automática por rango.
2. **Ventas por categoría** (columnas), clic para filtrar el resto de componentes compatibles.
3. **Participación por medio de pago** (donut), con importe y porcentaje; corregir pagos mixtos.
4. **Top 5/10 productos** (barras horizontales), clic para abrir detalle.
5. **Resumen por sucursal** (tabla: ventas, costo si existe, ganancia si existe, unidades, participación).
6. **Alertas operativas** (por vencer, stock bajo, cobros vencidos, si hay datos/permisos), con links reales al módulo correspondiente.

La pantalla debe permitir que el dueño evalúe el negocio en segundos sin convertirse en una copia del módulo Inicio. Inicio permanece simple; Reportes concentra el análisis profundo.

---

## 7. PESTAÑA 2: VENTAS

**Referencia:** imagen `Ventas`.

### KPIs

- Ventas netas.
- Cantidad de tickets.
- Ticket promedio.
- Unidades vendidas.

### Filtros específicos

Fecha, sucursal, categoría, vendedor/cajero si corresponde, medio de pago.

### Visualizaciones

1. **Ventas por día**: línea/área, comparación anterior, tooltip por día y clic para ver tickets del día.
2. **Ventas por hora**: columnas con distribución de importes por hora local, filtrable por fecha.
3. **Ventas por medio de pago**: donut consistente con pagos mixtos y ventas en cuenta corriente.
4. **Top categorías vendidas**: barras horizontales por cantidad o importe mediante selector.
5. **Mapa de calor días × horas**: matriz semanal (lunes a domingo × horarios registrados). Tooltip con monto y tickets; clic filtra día de semana/hora y muestra detalle.
6. **Detalle por sucursal**: tabla con ventas netas, tickets, ticket promedio, unidades, porcentaje del total.

**Agregar:** botón/menú para cambiar agrupación temporal `Hora / Día / Semana / Mes` donde corresponda. Permitir exportar detalle de tickets filtrados según permisos.

---

## 8. PESTAÑA 3: RENTABILIDAD

**Referencia:** imagen `Rentabilidad`.

### KPIs

- Ganancia bruta (real o claramente estimada).
- Margen bruto %.
- Costo de ventas.
- Ganancia bruta por ticket.

### Filtros específicos

Fecha, sucursal, categoría, laboratorio, proveedor si hay trazabilidad.

### Visualizaciones

1. **Evolución de margen y ganancia**: gráfico combinado columnas `Ganancia bruta` + línea `Margen %`, ejes etiquetados y unidades correctas.
2. **Productos más rentables**: barras horizontales con selector `Mayor ganancia total / Mayor margen %`; mostrar volumen para evitar conclusiones engañosas por una sola venta.
3. **Margen por categoría**: columnas, promedio ponderado.
4. **Participación de ganancia por sucursal**: donut + tabla con monto y porcentaje; solo sucursales autorizadas.
5. **Comparativa ingresos vs costo vs ganancia**: tabla por sucursal, con variación de margen en puntos porcentuales.
6. **Alertas de rentabilidad**: productos/categorías con margen bajo el objetivo configurado; enlace al análisis de producto/lista de precios, sin modificar precios automáticamente.

Agregar tooltips breves que expliquen diferencia entre **margen** y **recargo/markup**. No presentar estas cifras como ganancia neta después de gastos fijos.

---

## 9. PESTAÑA 4: PRODUCTOS

**Referencia:** imagen `Productos`.

### KPIs

- Productos activos.
- Cantidad de productos destacados o productos que concentraron el volumen definido (evitar indicador ambiguo `Top vendidos: 5` sin explicación).
- Productos sin movimiento en N días.
- Productos con stock bajo.

### Filtros específicos

Fecha, sucursal, categoría, laboratorio, estado de stock, búsqueda por producto/código de barras si existe.

### Visualizaciones

1. **Top productos vendidos**: barras horizontales de 10–20 productos; alternar unidades, facturación y ganancia cuando sea válida.
2. **Ventas por categoría**: barras, clic como filtro cruzado.
3. **Rotación vs margen**: scatter/bubble con cuadrantes alta/baja rotación, alto/bajo margen; umbrales visibles, radio representando volumen o facturación, tooltip con nombre/código.
4. **Participación por categoría**: donut de facturación neta.
5. **Productos con menor rotación**: tabla con producto, categoría, stock, días sin movimiento y rotación, con paginación y link a ficha.
6. **Productos destacados**: ranking con tendencia del período y pequeños sparklines cuando haya historia.

Prever nombres largos y presentaciones farmacéuticas. No mostrar códigos de barras ficticios.

---

## 10. PESTAÑA 5: INVENTARIO

**Referencia:** imagen `Inventario`.

### KPIs

- Valor del stock actual (según método de costo existente).
- Productos con stock bajo.
- Productos sin stock.
- Lotes/productos próximos a vencer (indicar explícitamente cuál se cuenta).

### Filtros específicos

Sucursal, depósito si existe, categoría, laboratorio, estado, ventana de vencimiento (30/60/90 días).

### Visualizaciones

1. **Evolución del valor de stock**: stacked area o línea **únicamente si se puede reconstruir histórico correctamente**. De lo contrario reemplazar con una visualización válida de stock actual + mensaje de histórico pendiente.
2. **Stock por categoría**: columnas en ARS según valuación de costo; tabla de detalle opcional.
3. **Distribución del capital inmovilizado**: donut con valor por categoría y %.
4. **Próximos vencimientos**: tabla con producto, lote, vencimiento, existencia, sucursal, días restantes, colores de prioridad. Separar vencidos.
5. **Stock crítico**: barras horizontales de existencias reales comparadas con mínimo del producto.
6. **Observaciones de inventario**: alertas clicables, sin falsos positivos; agregar opción de ver lotes/ajustes si hay permisos.

**Cuidado con inventario parcial:** pedidos aún no recibidos no suman al stock. Stock por sucursal no debe duplicarse al agregar depósitos/lotes.

---

## 11. PESTAÑA 6: COMPRAS Y PROVEEDORES

**Referencia:** imagen `Compras`.

### KPIs

- Compras confirmadas/facturadas del período (etiqueta según dato).
- Proveedores activos (definición explícita).
- Costo promedio unitario **solo si es comparable**; si no, reemplazar por `Variación promedio de costos` o métrica real más útil.
- Facturas pendientes de pago (cantidad; monto en tooltip o métrica secundaria).

### Filtros específicos

Fecha, sucursal, proveedor, categoría, estado del pedido/factura.

### Visualizaciones

1. **Evolución de compras**: línea/columnas según transacciones reales; con comparación anterior y herramienta de drill-down.
2. **Compras por proveedor**: barras de montos, clic para filtrado.
3. **Participación por proveedor/laboratorio**: donut con fuente de clasificación real.
4. **Facturas pendientes**: tabla con comprobante, proveedor, fecha, vencimiento, saldo y días de mora; no confundir monto original con deuda residual.
5. **Productos con mayor aumento de costo**: barras con comparación entre precios de compra equivalentes por unidad/presentación, período seleccionado y fuente.
6. **Recepciones pendientes**: pedidos pendientes y parcialmente recibidos, cantidades pedidas/recibidas/restantes; clic para ver compra original.

No marcar como recibidas compras que siguen pendientes. No duplicar importe por múltiples recepciones del mismo renglón.

---

## 12. PESTAÑA 7: CLIENTES Y CUENTAS CORRIENTES

**Referencia:** imagen `Clientes / Cuentas corrientes`.

### KPIs

- Clientes activos (definición visible).
- Saldo total de cuenta corriente.
- Cobrado en el período.
- Clientes con deuda.

### Filtros específicos

Fecha, sucursal, tipo de cliente si existe, estado de cuenta, vendedor si corresponde.

### Visualizaciones

1. **Evolución de cobranzas**: línea, comparación con período anterior; separar cobros de facturación.
2. **Top clientes por facturación**: barras; respetar permisos de consulta de datos de clientes.
3. **Distribución por tipo de cliente**: donut, solamente si la clasificación existe.
4. **Antigüedad de saldos**: barras para 0–30, 31–60, 61–90, 91–120, >120 días, en función de vencimientos reales.
5. **Clientes con mayor deuda**: tabla con saldo, antigüedad, última actividad, deuda vencida; clic abre detalle/estado de cuenta si autorizado.
6. **Últimos cobros**: tabla con fecha, cliente, monto, medio de pago y comprobante, sin duplicaciones.

**Privacidad:** no incluir DNI, CUIT ni teléfono en dashboards generales por defecto; solo en vistas detalladas y conforme a rol. Evitar exportaciones que expongan datos ajenos a las autorizaciones.

---

## 13. API PROPUESTA Y CONTRATOS (AJUSTAR A CONVENCIONES DEL PROYECTO)

Si la API actual tiene prefijo `/api/v1`, seguirlo. Rutas ilustrativas:

```http
GET /api/v1/reportes/filtros
GET /api/v1/reportes/resumen
GET /api/v1/reportes/ventas
GET /api/v1/reportes/rentabilidad
GET /api/v1/reportes/productos
GET /api/v1/reportes/inventario
GET /api/v1/reportes/compras
GET /api/v1/reportes/clientes
GET /api/v1/reportes/detalle?tipo=ventas&...
GET /api/v1/reportes/exportar?reporte=ventas&formato=csv&...
```

**Son nombres orientativos:** adaptar al routing/estilo del repositorio para no duplicar prefijos ni chocar con endpoints ya existentes.

### DTO de consulta común (conceptual)

```ts
type ReportFilters = {
  from?: string; // fecha local ISO YYYY-MM-DD
  to?: string; // fecha local ISO YYYY-MM-DD inclusiva a nivel UI
  branchId?: string; // ID autorizado o 'all' si el sistema lo soporta
  comparison?: "previous" | "yearAgo" | "none";
  granularity?: "hour" | "day" | "week" | "month";
  categoryIds?: string[];
  laboratoryIds?: string[];
  supplierIds?: string[];
  sellerIds?: string[];
  paymentMethodIds?: string[];
  clientTypeIds?: string[];
  search?: string;
};
```

Los IDs/tipos son ejemplos: **usar los tipos reales y la validación del proyecto**. `to` inclusive para la persona, convertido a fin exclusivo en el backend. Los filtros no aplicables a un endpoint se rechazan con error claro o se ignoran explícitamente según un contrato documentado: no crear efectos silenciosos.

### Ejemplo orientativo de respuesta

```json
{
  "meta": {
    "report": "ventas",
    "currency": "ARS",
    "timezone": "America/Argentina/Cordoba",
    "from": "2026-10-01",
    "to": "2026-10-31",
    "appliedBranchIds": [],
    "comparison": "previous",
    "dataQuality": { "partial": false, "warnings": [] }
  },
  "kpis": {
    "netSales": {
      "value": 0,
      "previous": 0,
      "changePct": null,
      "available": true
    },
    "ticketCount": {
      "value": 0,
      "previous": 0,
      "changePct": null,
      "available": true
    }
  },
  "charts": {
    "salesByDay": [],
    "salesByHour": [],
    "salesByPaymentMethod": []
  },
  "tables": {
    "salesByBranch": []
  }
}
```

**Es solo esquema ilustrativo, NO valores demo para producción.** Preferir estructuras pequeñas y consistentes, IDs para drill-down y metadatos suficientes para construir tooltips. No convertir a string los números salvo requerimiento específico para DECIMAL (si se devuelve string decimal, normalizar de manera segura en cliente/servidor según contrato).

### Recomendaciones de endpoints

- Los filtros se obtienen de catálogos reales y limitados por permisos.
- Los endpoints del dashboard agregan datasets relacionados para evitar decenas de requests iniciales; el detalle se solicita solo al abrir drawer/paginación.
- No devolver millones de transacciones para procesarlas en el frontend.
- Los detalles usan paginación, filtros, ordenamiento whitelisted, cantidad máxima configurable.
- Los errores de permisos deben responder `403`, datos inválidos `400`, sin exposición de SQL ni secretos.
- Añadir validación y tests del contrato.

---

## 14. RENDIMIENTO Y SEGURIDAD

### Rendimiento

- Agregar en SQL con `SUM`, `COUNT`, `GROUP BY`, joins validados y fechas indexadas, evitando `N+1`.
- Revisar índices realmente necesarios sobre fecha de transacción, sucursal, estado, producto, compra/venta, cliente y pagos; **no crear índices masivos sin analizar consultas**.
- Evitar transferir todo el histórico al navegador.
- Rangos extensos: agrupar automáticamente por semana/mes y limitar el número de puntos.
- React: cargar cada pestaña bajo demanda, memorizar transformaciones útiles y disponer correctamente instancias ECharts al desmontar.
- Agregar caché corta **solo cuando sea seguro y por usuario/sucursales/filtros**; invalidar al registrar/corregir venta, compra o movimiento, o aplicar TTL apropiado.
- Usar EXPLAIN/plan de ejecución en consultas lentas cuando sea viable; evitar bloquear ventas al consultar reportes.
- Exportaciones grandes: paginación/streaming o límites razonables, no volcar millones de filas a memoria de un VPS pequeño.
- Mantener tamaño del bundle controlado utilizando imports modulares de ECharts.

### Seguridad

- Toda consulta filtra por tenant/organización cuando exista y por sucursales autorizadas; **nunca confiar en `branchId` de la URL sin autorización**.
- Chequear roles y permisos antes de servir costos, ganancias, datos de clientes y cuentas corrientes. Permisos sugeridos (adaptar a los actuales): `reports.read`, `reports.profitability`, `reports.export`, `reports.clients`.
- Exportación debe volver a verificar permisos y filtros.
- No registrar información personal, SQL sensible ni datos de negocio completos en logs innecesarios.
- Usar consultas parametrizadas y whitelists de filtros, grouping, sorting y campos seleccionables.
- Si algún usuario puede configurar tableros, no permitir ejecutar expresiones arbitrarias ni construir SQL desde la UI.

---

## 15. EXPORTACIÓN DE REPORTES

Agregar botón `Exportar` consistente con el diseño y permisos. Opciones:

1. **CSV**: tabular, UTF-8 con BOM solo si se necesita compatibilidad práctica con Excel; separador/decimales documentados según configuración regional. Proteger contra _CSV formula injection_ escapando celdas que comiencen por `=`, `+`, `-`, `@` u otros prefijos peligrosos.
2. **Excel (.xlsx)**: exportar tablas útiles con encabezados, formatos ARS, fechas y filtros aplicados. Añadir metadatos de rango, sucursal y fecha de generación.
3. **PDF**: versión imprimible limpia del reporte, con encabezado, KPIs, gráficos exportados a imagen/SVG cuando sea técnicamente viable y tablas paginadas. Puede implementarse primero mediante vista de impresión optimizada si así es más confiable, documentando esa elección.
4. **PNG de gráfico**: opcional, usando exportación nativa de ECharts cuando aplique.

No generar solo una captura gigante ilegible. Respetar colores, títulos, orientación A4/landscape si conviene, cortes de página y datos autorizados. Comparar el contenido exportado con los filtros visibles, sin incluir información ajena.

---

## 16. DRILL-DOWN Y DRAWER DE DETALLE

Diseñar un componente genérico `DrilldownDrawer` reutilizable que pueda abrirse desde KPIs, barras, donuts, tablas y mapa de calor.

Debe mostrar:

- Título contextual: por ejemplo `Ventas / Categoría: Analgésicos / Octubre 2026`.
- Chips de filtros aplicados y ruta/breadcrumb del análisis.
- Total conciliado con el elemento que originó el clic.
- Tabla paginada con columnas acordes al tipo (venta, fecha, producto, cantidad, importe, sucursal, etc.).
- Ordenamiento/búsqueda razonable.
- Enlaces a módulos existentes para abrir la operación original si el usuario tiene acceso.
- Opción de exportación del mismo detalle.
- Estados cargando, vacío, error y reintento.

Clic repetido en un gráfico no debe acumular selecciones confusas. Botón `Volver`/`Limpiar selección` visible.

---

## 17. OPCIONAL DESPUÉS DE LAS 7 PESTAÑAS: "MIS TABLEROS" (POWER BI LITE)

**No sacrificar los 7 reportes principales por esta función.** Si la estructura y tiempo lo permiten, agregar una segunda etapa de personalización con una opción `Mis tableros`:

- Crear un tablero personal desde widgets predefinidos y **fuentes de datos autorizadas**.
- Arrastrar y reordenar tarjetas, cambiar ancho/alto dentro de una grilla responsive.
- Agregar/quitar/duplicar widgets autorizados.
- Elegir nombre y filtros por defecto, guardar en base con dueño y permisos.
- Restaurar vista original.
- Usar solo consultas existentes del servidor y definiciones válidas; no permitir ejecutar SQL libre.
- Si se implementa persistencia, usar migración segura y tests de autorización por usuario/sucursal.

No prometer compatibilidad con DAX, Power Query o edición completa de un archivo `.pbix`: **el objetivo es una experiencia visual e interactiva parecida, no clonar internamente Power BI**.

---

## 18. ESTRUCTURA DE ARCHIVOS SUGERIDA (ADAPTAR AL PROYECTO)

No crear esta estructura literalmente si el repositorio usa otra mejor. Es una orientación:

```text
frontend/src/
  modules/reports/
    pages/
      ReportsLayout.tsx
      ReportsOverview.tsx
      SalesReport.tsx
      ProfitabilityReport.tsx
      ProductsReport.tsx
      InventoryReport.tsx
      PurchasesReport.tsx
      ClientsReport.tsx
    components/
      ReportKpi.tsx
      ReportFilters.tsx
      ReportChart.tsx
      ReportTable.tsx
      ReportToolbar.tsx
      ReportEmptyState.tsx
      DrilldownDrawer.tsx
      ChartTooltip.tsx
    charts/
      SalesTrendChart.tsx
      CategoryBarChart.tsx
      PaymentDonutChart.tsx
      WeeklyHeatmapChart.tsx
      RotationMarginScatterChart.tsx
    hooks/
      useReportFilters.ts
      useReportQuery.ts
    services/
      reportsApi.ts
    types/
      reports.types.ts
    utils/
      formatARS.ts
      reportDates.ts
      chartTheme.ts

backend/src/
  modules/reports/
    reports.module.ts
    reports.controller.ts
    reports.service.ts
    reports.repository.ts
    dto/
    calculators/
    exporters/
    tests/
```

Reutilizar módulos/funciones compartidas del sistema cuando existan. Evitar crear duplicados de `formatCurrency`, autenticación, cards, permisos o date pickers.

---

## 19. PRUEBAS OBLIGATORIAS Y CRITERIOS DE ACEPTACIÓN

### Pruebas automáticas de backend

Cubrir, como mínimo:

- Ventas confirmadas contra borradores, anulaciones y devoluciones.
- Descuentos por línea y globales sin duplicación.
- Pagos mixtos: por ejemplo, ticket de $10.000 pagado $6.000 efectivo y $4.000 transferencia; total de ventas $10.000 y reparto por medio de pago correcto, **nunca $20.000**.
- Venta a cuenta corriente + cobro posterior no produce doble venta.
- Tickets = operaciones elegibles, no sumatoria de renglones.
- Costo histórico y margen ponderado; sin inventar costos ausentes.
- Recepciones parciales: de 200 pedidos, recibir 100 deja 100 pendientes; stock suma solo 100.
- Inventario con varios lotes y depósitos, sin duplicar existencias.
- Fechas, diferencias de períodos, zonas horarias, límites de día y denominador cero.
- Cliente con pagos parciales y notas de crédito; saldo y aging correctos.
- Consulta/descarga entre sucursales: rol limitado recibe solo lo autorizado.
- Conciliación de totales de KPI vs series de gráficos/filas de tablas cuando cubren el mismo universo.

### Pruebas de frontend

- Navegan las 7 pestañas sin romper diseño ni perder filtros globales.
- Cambiar fecha/sucursal modifica realmente tarjetas y gráficos.
- Selección cruzada y botón limpiar funcionan.
- Drill-down abre el detalle correcto y vuelve atrás.
- Estado sin datos / error muestra mensaje útil, no gráficos llenos de ceros ficticios.
- Usuarios sin permiso no ven datos restringidos ni pueden exportarlos.
- Diseño usable en 1440 px, 1280 px, tablet y móvil.
- Exportar CSV/XLSX/PDF utiliza exactamente el rango y filtros mostrados.

### Verificación de calidad

- Ejecutar scripts de lint, typecheck, test y build que ya tenga el proyecto.
- Si hay pruebas E2E, incorporarlas a las rutas más importantes.
- Si hay Playwright o mecanismo de captura ya configurado, generar screenshots de las 7 pestañas y compararlos visualmente con las referencias.
- Revisar consola: sin errores de render ni warnings graves.
- No introducir importaciones rotas, endpoints sin protección, migraciones destructivas ni dependencias de pago.

### Checklist de aceptación funcional

- [ ] `Reportes` aparece y abre desde el menú actual.
- [ ] Título y encabezado siguen la estética y reglas existentes.
- [ ] Las 7 pestañas funcionan y consultan datos reales.
- [ ] Fechas y sucursales alteran los resultados correctamente.
- [ ] KPIs, gráficos y tablas concilian.
- [ ] Clic en gráficos filtra o abre detalle real.
- [ ] Herramientas de comparación temporal funcionan.
- [ ] Múltiples medios de pago no duplican ventas.
- [ ] Margen y costo histórico se calculan de forma confiable o muestran aviso.
- [ ] Stock, lotes y recepciones parciales se tratan correctamente.
- [ ] Cuentas corrientes distinguen ventas, deuda y cobranza.
- [ ] Exportaciones disponibles según permisos y sin errores.
- [ ] Diseño consistente en escritorio y pantallas pequeñas.
- [ ] Seguridad multi-sucursal validada en backend.
- [ ] Módulos preexistentes siguen funcionando.
- [ ] Build, tests y lint pasan (o se documentan fallas previas/del entorno con evidencia).

---

## 20. ORDEN DE EJECUCIÓN RECOMENDADO (HACER, NO SOLO PLANIFICAR)

**Fase A — Inspección y contratos**

1. Leer el repositorio, construir mapa de modelo de datos y permisos.
2. Identificar fuente confiable para cada indicador; preparar matriz `métrica → fuente → fórmula → filtros → limitaciones`.
3. Definir contratos comunes entre frontend y backend y componentes reutilizables.
4. Revisar si hay datos históricos de costos y stock; decidir estados `no disponible` antes de dibujar gráficos.

**Fase B — Infraestructura de reportes**

5. Crear módulo y servicios de consultas agregadas; añadir tests de negocio.
6. Crear layout de Reportes, navegación, filtros, estados, tema ECharts, cards, tablas, formatters ARS.
7. Integrar autorización y sucursales permitidas desde el primer endpoint.

**Fase C — Implementación de las 7 pestañas**

8. Implementar `Ventas` y `Resumen` con datos reales y controles interactivos.
9. Implementar `Productos` y `Inventario`.
10. Implementar `Rentabilidad` con las limitaciones de costos debidamente tratadas.
11. Implementar `Compras` y `Clientes / Cuentas corrientes`.
12. Añadir drill-down, filtros cruzados, comparaciones temporales y enlaces a operaciones.

**Fase D — Calidad y cierre**

13. Agregar exportaciones reales y validación de permisos.
14. Optimizar consultas y revisar índices/performance.
15. Probar escenarios de negocio y responsive.
16. Documentar cualquier métrica no confiable para la que se requiera registrar información nueva a futuro.
17. Ejecutar los tests/build y entregar resumen concreto de archivos modificados, migraciones, endpoints, decisiones y cómo usarlo.

No terminar en `plan propuesto`: **hacer los cambios y verificar**. Si hay una restricción externa real que impida un punto, dejar todo lo demás funcionando y documentar bloqueos de forma precisa con siguiente acción concreta.

---

## 21. FORMATO DE RESPUESTA FINAL QUE QUIERO DE CODEX

Al terminar, informame de manera concreta:

1. **Qué implementaste**: las 7 pestañas y la funcionalidad que realmente quedó operativa.
2. **Archivos importantes creados/modificados** y endpoints.
3. **Tablas/migraciones nuevas**, si hubo, y cómo aplicarlas sin perder datos.
4. **Métricas con datos completos** y **métricas parciales/no disponibles** (especialmente costos históricos e inventario histórico).
5. **Tests/build/lint ejecutados y resultado real**, no afirmaciones sin ejecución.
6. **Pasos exactos para levantarlo** localmente y desplegarlo en el hosting actual.
7. **Qué no se implementó** y por qué, sin ocultarlo.
8. **Capturas de cada pantalla** si existe herramienta de screenshots en el repositorio.

**Prioridad final:** un módulo profesional y muy bien diseñado, similar visualmente a Power BI, plenamente integrado al sistema, rápido, seguro y gratuito; que el dueño de la farmacia pueda explorar sus datos sin tener que usar otra plataforma.

---

## NOTAS PARA INTERPRETAR LAS 7 IMÁGENES DE REFERENCIA

- Son solo propuestas visuales; algunas ilustraciones contienen cifras no conciliadas, `MXN`, fechas antiguas, sucursales genéricas y ejemplos no reales.
- En la implementación **corregir todo eso** y consultar la base de datos real.
- Mantener la barra de título superior propia del software, evitar duplicidad del título dentro de la página.
- No volver el módulo un collage de gráficos: priorizar jerarquía, lectura, espacio en blanco y acciones útiles.
- Todos los gráficos deben poder comunicar su valor incluso sin animaciones o con pocos datos.

**Empezá ahora por inspeccionar el repositorio y luego avanzá con la implementación completa.**
