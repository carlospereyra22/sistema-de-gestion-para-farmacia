# Ticket V24 adaptado al navegador — candidato a validación física

**Resultado posterior:** el usuario comparó ambos papeles y rechazó esta versión
por texto pequeño y poco legible. Ya no es el botón principal. Se restaura RAW y
se prueba el instalador descrito en LOCAL_PRINT_AGENT.md. No publicar esta
adaptación como equivalente al formato aprobado.

La decisión actual es imprimir en la térmica instalada en cada computadora usando
su controlador y el diálogo del navegador. No requiere agente, Print Box ni cola
Cloud. Cambia el transporte y adapta el diseño; no convierte HTML en RAW ni puede
prometer equivalencia física con la fuente interna de una impresora.

## Implementación

- El botón compartido de ventas, historial y cobros carga los datos reales e imprime
  un iframe aislado directamente, sin una vista previa adicional del sistema.
- Espera la carga de imágenes y fuentes. React StrictMode y rerenders no abren un
  segundo diálogo. Reabrir la impresión es una acción explícita.
- No consulta loopback ni persiste estados de «impreso». El navegador no confirma
  papel ni distingue impresión de cancelación. No hay reintentos automáticos.
- Logo y nombre originales: `apps/web/src/lib/v24/*-bitmap.json`, copiados del
  `vps-broker` suministrado. Los bits se representan como trazados SVG sin remuestreo;
  pruebas comparan la cantidad de píxeles negros. El nombre bitmap solo se usa cuando
  coincide con FARMACIA JUNCOS. Otras organizaciones conservan su nombre configurado;
  un logo personalizado conserva prioridad. No se copian dirección/CUIT/teléfono demo.
- Medidas de referencia: papel 80 mm, área 72 mm, 48 columnas, 8 puntos/mm;
  logo original 18 × 19 mm y nombre original 64 × 5,5 mm. Total en doble tamaño,
  símbolo monetario sin negrita, Code39 con el número real, pagos y descuentos.
- Mantiene sucursal, cliente, nombre de atención, estado anulado y datos de cobros.
  Los importes provienen de los documentos: no se recalculan desde los artículos.
- El tamaño de página se calcula después de cargar el contenido para evitar una
  hoja larga vacía. El controlador puede imponer su propio tamaño y límites.

## Diferencias que requieren comprobar papel

El texto utiliza Courier del navegador, no la ROM tipográfica del equipo. La
densidad RAW 4, el corte y los avances mecánicos no se pueden imponer con CSS:
dependen del controlador. La nitidez, el área imprimible y la escala pueden variar.
Los bitmaps conservan sus datos, pero el controlador puede remuestrear su salida.
No se afirma que el resultado sea idéntico a V24 hasta comparar ambos tickets.

En la Xprinter XP-80 seleccionar rollo 80 mm, escala 100 %, sin márgenes ni
encabezados/pies del navegador. Verificar el ajuste de corte en el controlador.
Comparar logo/nombre, cuerpo, alineación de ticket/sucursal/cliente, importes,
total, barcode y corte con el papel RAW aprobado. Probar también recibo de cuenta,
descuento, nombre largo y ticket con muchos artículos. Si no coincide, ajustar o
mantener RAW como alternativa, sin cambiar automáticamente de transporte.

## Verificado

- Pruebas unitarias de datos, seguridad HTML, bitmaps y tamaño físico configurado.
- Chrome headless: una carga/un diálogo bajo StrictMode, cero solicitudes a agente,
  rerender sin duplicación, reapertura explícita y tamaño de página calculado.
- Inspección visual de la plantilla en navegador. No se imprimió papel, no se probó
  escáner ni otra impresora. Producción permanece sin actualizar hasta aceptar el formato.

El código RAW anterior se conserva separado, fuera del botón principal. No se
habilitó Cloud V24. El paquete de `.cache/releases/20260920-preparacion` es anterior
a este cambio y no debe publicarse como si incluyera esta adaptación.
