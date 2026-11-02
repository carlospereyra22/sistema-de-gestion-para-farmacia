# Cantidad y escáner en ventas

Los errores de cantidad se muestran únicamente en la notificación compartida inferior derecha, sin globo sobre el campo. El campo recupera la cantidad válida anterior. Las notificaciones de error se cierran a los 6 segundos (éxito: 3 segundos); el temporizador se pausa mientras el aviso tenga el puntero o foco, y puede cerrarse manualmente.

El control conserva botones compactos de ancho fijo y una cantidad editable, sin borde interior. Enter confirma; Escape descarta la edición. Ambos y los botones +/− devuelven el foco al buscador. Salir hacia otro campo confirma sin robarle el foco.

Un clic primario en una zona no interactiva del panel de ventas devuelve el foco al buscador sin desplazar la pantalla ni cambiar la búsqueda. No se aplica sobre campos, botones, enlaces, etiquetas de controles, menús o elementos editables, ni con selección de texto, modal abierto, venta enviándose o fuera del POS activo. El evento ocurre después del blur de cantidad, conservando su validación.

Dentro de cantidad se reconoce una ráfaga de al menos ocho caracteres, intervalos menores a 80 ms, promedio menor a 40 ms y Enter dentro de 100 ms. Se busca ese código en los códigos del catálogo y se agrega una unidad mediante el flujo existente (con validación de stock); si no existe, se avisa sin convertirlo en cantidad. La cantidad anterior se conserva al detectar un escaneo. No se interceptan otros campos editables ni ventanas modales. F2 sigue siendo el acceso explícito al buscador.

Atajos de Ventas (01/11/2026, SISTEMA-16): fuera de campos editables, + y − suman o restan una unidad en la última línea agregada (al llegar a 0 se quita); Ctrl + Enter abre el cobro desde cualquier lugar, incluso desde un campo. Dentro de la ventana de cobro, 1–4 eligen el medio de pago fuera de campos, por lo que los dígitos siguen yendo al importe o al escáner. El detalle del producto elegido tiene su propia cantidad: Enter en el buscador agrega con esa cantidad y el código exacto escaneado tiene prioridad. Ver `lib/sales-shortcuts.ts` y docs/WORKSPACE.md.

Lectores lentos, códigos cortos o sufijos distintos de Enter requieren usar el buscador/F2 o ajustar la integración después de probar el dispositivo. Las pruebas automáticas cubren cantidades y clasificación de ráfagas; queda pendiente verificar foco, tiempos y lectura con el escáner físico.
