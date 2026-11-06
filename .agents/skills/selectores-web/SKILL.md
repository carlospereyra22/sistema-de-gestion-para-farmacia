---
name: selectores-web
description: Estandar de selectores de la web del sistema de farmacia. Usar al arreglar, retocar o redisenar una vista que tiene selectores, y al agregar un selector nuevo. Los select nativos de esa vista se pasan a ProductFilterSelect dentro del mismo arreglo.
---

# Selectores de la web

El selector del sistema es `ProductFilterSelect`
(`apps/web/src/product-filter-select.tsx`): campo blanco redondeado, icono teal,
etiqueta arriba y valor abajo, flecha a la derecha y lista flotante con la opcion
elegida en teal claro con check. No se usa `<select>` nativo.

## Regla

- Si se esta arreglando una vista y tiene selectores nativos, **se incluyen en ese
  arreglo**, sin que haga falta pedirlo ni abrir otra tarea. Vale para toda la vista:
  filtros, detalle y los formularios o dialogos que se abren desde ella.
- Agregarlo a la tarjeta de Trello de la tarea y mencionarlo en el informe final.
- Un selector nuevo siempre usa este componente.
- No salir a migrar otras pantallas: solo la vista de la tarea. Los selectores de
  otras vistas se pasan cuando le toque el arreglo a cada una.
- Si la lista es larga y necesita busqueda, usar `searchable-sale-select.tsx`.

## Filtros de un listado

Version completa (`h-12`), con icono y sin `compact`. Ejemplo:
`product-catalog-toolbar.tsx`.

```tsx
<ProductFilterSelect
  label="Vencimiento"
  icon={<CalendarDays size={18} />}
  value={due}
  options={[
    { value: "ALL", label: "Todos" },
    { value: "OVERDUE", label: "Vencidas" },
  ]}
  onChange={(value) => {
    setDue(value);
    setPage(1);
  }}
/>
```

- Buscador y botones de la misma fila tambien en `h-12`. Las constantes `primary` y
  `secondary` traen `h-10`: agregar `h-12!`.
- La etiqueta ya dice el tema, asi que la opcion vacia es "Todos", no "Todos los
  vencimientos".
- Un solo estilo de filtro por pantalla: no mezclar con pastillas ni con `compact`.

## Formularios y dialogos

Version `compact`, sin icono y con la etiqueta arriba, para alinear con los inputs de
`h-10`. Ejemplo: `customer-editor.tsx`.

```tsx
<div className="text-sm text-slate-500">
  <p className="mb-1">Medio de pago</p>
  <ProductFilterSelect
    compact
    label="Medio de pago"
    icon={null}
    value={method}
    options={options}
    onChange={setMethod}
  />
</div>
```

- No envolverlo en `<label>`: el componente ya tiene su `aria-label`.
- Si la etiqueta va en negrita, poner `font-medium` en el `<p>` y no en el contenedor,
  porque el selector lo hereda.
- Dentro de un `fieldset` deshabilitado, pasar tambien `disabled`: si no, se ve activo.
- Un dialogo con scroll necesita `data-product-editor-body` en el contenedor para que
  la lista abra hacia arriba cuando no entra abajo. `PayableDialog` ya lo tiene.

## Al terminar

- `onChange` recibe el valor, no el evento: reemplazar `e.target.value`.
- Revisar los tests de la vista: algunos verifican `<select` en el HTML.
- Abrir las listas en el navegador y confirmar que no quedan cortadas por un panel con
  `overflow`.
- Seguir la skill `cerrar-tarea`.
