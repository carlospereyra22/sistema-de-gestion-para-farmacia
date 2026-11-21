---
name: diseno-sistema
description: Lenguaje visual del sistema de gestion de farmacia (apps/web). Usar antes de crear o retocar cualquier pantalla, dialogo, boton, selector, fecha, tarjeta o encabezado, para que todo se vea como el sistema y no como un diseno generico. Incluye las piezas propias que hay que reutilizar y la revision visual con capturas.
---

# Diseño del sistema de gestión

El sistema tiene un lenguaje propio: verde azulado (teal / `marca`) sobre fondos
claros, tarjetas blancas de borde suave, íconos de línea y textos en español
rioplatense. **Nada se inventa de cero**: primero se busca la pieza que ya existe.
Si una pantalla "parece hecha por IA" (píldoras con puntito, botones sin ícono,
`<select>` y calendarios del navegador, colores sueltos), se corrige con estas
piezas.

Leer junto con: `docs/MODO_OSCURO.md` (colores), `docs/WORKSPACE.md` (anchos y
menú) y la skill `selectores-web`.

## 1. Colores

- Sólo la paleta de Tailwind y los tokens de `src/tema.css` (`marca-*`,
  `niebla-*`, `fondo`, `velo`). **Nunca hex sueltos** (`bg-[#e8faf5]`): rompen el
  modo oscuro, que cambia las variables y no los valores.
- Acción y marca: `teal-700` (botón principal), `teal-600` (íconos),
  `marca-535` (texto activo), `marca-970` (fondo activo), `marca-908` (borde
  activo). Fondo del menú: `niebla-996`.
- Estados: verde `emerald` (bien, abierta), ámbar `amber` (atención,
  pendiente), rojo `rose` (error, faltante, borrar). Siempre con texto, no sólo
  color.

## 2. Piezas que hay que usar

| Para                        | Usar                                                          | Archivo                                            |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Elegir de una lista         | `ProductFilterSelect` (nunca `<select>`)                      | `product-filter-select.tsx` (ver `selectores-web`) |
| Lista larga con búsqueda    | `SearchableSaleSelect`                                        | `searchable-sale-select.tsx`                       |
| Fechas                      | `SelectorFecha` (nunca `<input type="date">`)                 | `selector-fecha.tsx`                               |
| Importes                    | `MoneyInput`                                                  | `money-input.tsx`                                  |
| Botones                     | `Boton` (primario, secundario, suave, peligro) y `botonTexto` | `boton.tsx`, `lib/botones.ts`                      |
| Botón de la barra de arriba | `BotonEncabezado` (ícono en recuadro + dos líneas)            | `boton-encabezado.tsx`                             |
| Tablas                      | `DataTable`, `DataTableRow`, `CellText`                       | `data-table.tsx`                                   |
| Íconos del menú lateral     | imágenes en `src/assets/iconos/menu-lateral` + `IconoImagen`  | `lib/iconos-menu-lateral.ts`                       |
| Otros íconos                | `lucide-react`, de línea, 15-18 px                            | —                                                  |

### Fechas: `SelectorFecha`

Mismo campo que `ProductFilterSelect`, calendario propio en español que empieza
el lunes, "Hoy" y "Borrar", teclado (flechas, Re Pág/Av Pág, Esc), `min`/`max`.
El valor es el texto `"AAAA-MM-DD"` de siempre (o `""`), así que reemplaza a
`<input type="date">` sin tocar la lógica:

```tsx
<div className="text-sm">
  <p>Fecha (opcional)</p>
  <div className="mt-1">
    <SelectorFecha
      compact
      label="Fecha de la compra"
      value={fecha}
      onChange={setFecha}
    />
  </div>
</div>
```

- `compact` (h-10) en formularios y diálogos con la etiqueta afuera; sin
  `compact` (h-12) en filas de filtros, con la etiqueta adentro.
- Rango "Desde / Hasta": pasar `max={hasta}` al desde y `min={desde}` al hasta.
- `vacio` es lo que se lee sin fecha ("Sin fecha", "Cualquier fecha").
- El calendario flota fijo sobre todo (también dentro de diálogos); no hace falta
  nada especial en el contenedor.
- No dispara el evento `change` nativo: si la vista dependía de un `onChange` en
  un contenedor (ej. volver a la página 1), hacerlo en el `onChange` propio.

### Botones: `<Boton>` (`src/boton.tsx`)

El sello del sistema: **el ícono va en su recuadro** (como en el menú activo, la
tarjeta de la caja y Venta actual) y **la tecla, a la vista** (como "Agregar
Enter" en Ventas). Un botón con un ícono suelto al lado del texto se ve genérico.

```tsx
<Boton icono={<X size={15} />} tecla="Esc" onClick={cerrar}>
  Cancelar
</Boton>
<Boton variante="primario" icono={<Save size={15} />} onClick={guardar}>
  Guardar pedido
</Boton>
```

- `variante`: `primario` (la acción principal: una sola por pantalla o diálogo,
  a la derecha del pie), `secundario` (apoyo: Cancelar, Volver), `suave` (una
  destacada que no es la principal: Importar archivo, Recibir mercadería),
  `peligro` (borrar, anular, cerrar un saldo).
- `icono`: siempre, de lucide en 15 px, del verbo: Guardar (`Save`), Cancelar
  (`X`), Volver (`ArrowLeft`), Continuar (`ArrowRight`), Nueva (`Plus`), Recibir
  (`PackageCheck`), Reintentar (`RotateCcw`), Importar (`FileUp`).
- `tecla`: sólo si esa tecla funciona de verdad ("Esc" en un diálogo que se
  cierra con Esc, "Enter" si Enter lo dispara).
- `alto`: `h-10` en formularios y diálogos; `h-12` en una fila de filtros.
- Algo menor dentro de un pie o una fila (Descartar borrador): `botonTexto` de
  `lib/botones.ts`.
- Botones de la barra de arriba: `BotonEncabezado` (abajo).
- **Trampa conocida:** `index.css` tiene `button { font: inherit }` sin capa, que
  le gana a `text-sm` y a cualquier clase de letra **puesta en el `<button>`**.
  Por eso `Boton` pone la letra en un `<span>` de adentro. En un botón propio,
  hacer lo mismo.

### Barra de arriba y tarjetas de estado

- Datos de estado (la caja donde se cobra, la cuenta) van como **tarjeta**: ícono
  en un recuadro de color suave (`size-8 rounded-lg bg-marca-970 text-marca-535`)
  y dos líneas: una chica arriba (`text-[11px] text-slate-500`) y el dato abajo
  (`text-sm font-semibold text-slate-800`). El estado, como un punto sobre el
  ícono y una palabra de color. Ejemplo: `SaleCashStatus` en
  `cash-register-picker.tsx`.
- Los botones de esa barra usan `BotonEncabezado` con la misma forma, así una
  tarjeta y un botón quedan como par.
- Nada de píldoras redondas con un puntito suelto (`rounded-full px-2.5` con
  `size-1.5 rounded-full bg-current`): es lo que se ve "genérico".

## 3. Medidas

- Campos y botones de formularios: `h-10`. Filtros de un listado: `h-12`.
  Barra de arriba: `h-11`.
- Tarjetas: `rounded-xl border border-slate-200 bg-white shadow-sm`. Listas
  flotantes: `rounded-xl` con `shadow-[0_12px_32px_-8px_rgba(15,60,80,.25)]`.
- Diálogos: velo `bg-velo/40`, `rounded-2xl`, título con ícono teal a la izquierda.
- Números con `tabular-nums`; importes con la moneda de `es-AR`.
- Anchos de pantalla: respetar los cortes de `docs/WORKSPACE.md`
  (1800/1600/1440/1200/1024/768) y que no haya desplazamiento horizontal.

## 4. Textos

- Español rioplatense y directo: "Guardá", "Elegí", "Cobrás en".
- Etiquetas cortas; la opción vacía de un filtro es "Todos", no "Todos los …".
- Nada de textos de relleno, métricas inventadas ni "¡Bienvenido!" genéricos.

## 5. Revisión antes de terminar

1. ¿Quedó algún `<select>` o `<input type="date">` en la vista? Pasarlos a las
   piezas del sistema (en toda la vista que se está tocando, como dice
   `selectores-web`).
2. ¿Cada botón es un `Boton` con ícono en su recuadro, tecla si la hay y una sola principal?
3. ¿Hay colores hex o clases de color sueltas fuera de la paleta?
4. **Mirarlo de verdad**: con `pnpm dev` levantado, sacar capturas en 1920, 1440
   y 1280 px (Chrome automatizado con `puppeteer-core` y el Chrome instalado, en la
   carpeta temporal, nunca en el repo) y revisar: alineación, alturas iguales en
   una misma fila, textos cortados, listas o calendarios recortados por un
   diálogo, y el estado activo / hover.
5. En el informe, decir qué se vio en capturas y qué no se pudo ver (modo oscuro,
   celular, impresora).
