# Modo oscuro (SISTEMA-105)

## Para el usuario

- Se activa desde el menú de la cuenta (arriba a la derecha): **Modo oscuro**, con
  un switch. El cambio es inmediato y el menú queda abierto.
- Lo elige cada navegador, no cada usuario: queda guardado en esa PC
  (`localStorage`, clave `gestion:tema`), sobrevive a cerrar sesión y ya se ve en la
  pantalla de ingreso. Otras pestañas abiertas cambian solas.
- Por defecto, claro. Los tickets, comprobantes A4 y etiquetas se siguen viendo en
  papel blanco.

## Cómo funciona

La web no tiene una versión oscura de cada pantalla. Todos los colores salen de
variables CSS (`--color-slate-200`, `--color-teal-600`, `--color-white`, y los
propios `--color-marca-535`, `--color-niebla-913`...). Cuando `<html>` tiene la
clase `dark`, `src/tema-oscuro.css` redefine esas variables y toda la aplicación
cambia sola, incluidas las pantallas que se agreguen después.

- `src/tema.css`: colores propios del sistema (fuente de verdad, en `@theme
static`), variante `dark:` de Tailwind y ajustes del modo oscuro.
- `src/tema-oscuro.css`: **generado** por `apps/web/scripts/generar-tema-oscuro.mjs`;
  no editar a mano.
- `src/lib/tema.ts`: leer, guardar y aplicar el tema. `index.html` aplica el tema
  guardado antes de pintar, para que no haya un destello claro al abrir.
- `src/use-tema.ts` y `src/tema-switch.tsx`: el switch del menú de la cuenta.
- Gráficos de Reportes (ECharts no lee variables CSS): `lib/report-chart-theme.ts`
  tiene un tema oscuro y `adaptarOpcionAlTema` cambia los colores claros conocidos
  de cada opción por su par oscuro. Al cambiar de tema el gráfico se vuelve a crear.

### La conversión

El generador toma cada color claro y calcula el oscuro en OKLCH: invierte la
luminosidad con una curva (fondos claros → superficies oscuras, textos oscuros →
textos claros) y conserva el tono. Los fondos tenues de color ganan algo de
saturación para que los estados (verde, ámbar, rojo) se sigan distinguiendo; los
grises no. Tres valores son a mano: `white` (tarjetas y diálogos), `fondo` (fondo
de la app, más oscuro que las tarjetas) y `velo` (detrás de los diálogos, siempre
oscuro).

Estilo (ajustado el 13/11/2026 a pedido del usuario, que lo veía «muy negro»): las
superficies no son grises sino azul petróleo profundo (los grises que quedan como
fondo o borde toman ese tono); el encabezado y la barra lateral llevan un degradé
verde azulado de marca, y el ítem activo del menú (`aria-current="page"`) se
resalta con verde y una barrita de acento. Los colores de botones y montos son algo
más vivos que la conversión directa.

Consecuencia: un botón `bg-teal-700 text-white` pasa a ser verde claro con texto
oscuro. Es intencional y mantiene el contraste.

## Reglas para código nuevo

- **No usar hex sueltos** en clases (`bg-[#e8faf5]`) ni `#fff`/`white` en
  `index.css`: no cambian con el tema. Usar la paleta de Tailwind o los colores
  propios (`bg-marca-970`, `border-niebla-913`). `src/tema-colores.test.ts` falla si
  aparece uno.
- Colores desde `style` (tarjetas de indicadores): `"var(--color-azul-487)"`. En SVG
  van en `style={{ stroke: color }}`, no en el atributo `stroke`, que no acepta
  `var()`.
- Un color propio nuevo: agregarlo en `@theme static` de `src/tema.css` y correr,
  desde `apps/web`, `node scripts/generar-tema-oscuro.mjs`. Lo mismo al usar por
  primera vez una familia de Tailwind (`lime`, `pink`...). El número del nombre es
  la luminosidad: más alto, más claro.
- Velos de diálogos: `backdrop:bg-velo/40` o `bg-velo/35`, no `bg-slate-950/40`
  (en oscuro `slate-950` es casi blanco).
- `tema-claro`: la zona conserva los colores del tema claro. Para vistas previas de
  papel hechas con `div` y paneles de marca que ya son oscuros con texto blanco
  (panel izquierdo del ingreso, encabezados de Ofertas). Los `iframe` de tickets y
  A4 no la necesitan.
- Para algo puntual que deba verse distinto en oscuro existe la variante `dark:`;
  casi nunca hace falta.

## Validación

Se revisó en navegador (Edge) con capturas en claro y oscuro: ingreso, Inicio,
Ventas, Productos, Inventario, Caja, Cuentas corrientes con un diálogo abierto,
Compras, Clientes, Ofertas, Reportes con gráficos, el menú de la cuenta y ancho
de celular. El modo claro no cambia: los colores propios se unificaron sólo
cuando la diferencia es imperceptible (ΔE OKLab < 0,012).
