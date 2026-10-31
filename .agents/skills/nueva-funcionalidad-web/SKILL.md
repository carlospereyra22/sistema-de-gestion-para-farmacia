---
name: nueva-funcionalidad-web
description: Agregar o modificar pantallas, componentes o logica de interfaz en el frontend React/Vite (apps/web) del sistema de farmacia. Usar al tocar workspaces, dialogos, formularios, el punto de venta, lib/api.ts o tests de la web.
---

# Nueva funcionalidad en la web (apps/web)

## Principios

- **El backend es la autoridad** de precios, permisos, totales, stock y operaciones.
  La web presenta y solicita; nunca dejar una regla critica solo en React. Si hace
  falta una regla nueva, implementarla en la API (skill `nueva-funcionalidad-api`) y
  en la web solo previsualizarla.
- Textos de interfaz en espanol rioplatense ("Guardá", "Revisá"), coherentes con los
  existentes.
- Borradores (venta pendiente, compras, distribucion) viven en memoria o
  `sessionStorage` acotados por usuario/organizacion/sucursal; nunca son autoridad.

## Donde va cada cosa

- `src/*.tsx`: componentes planos en kebab-case (`sale-quantity-input.tsx`), con su
  test al lado (`sale-quantity-input.test.tsx`).
- `src/lib/*.ts`: logica pura (calculos de vista previa, filtros, formato) con test
  `*.test.ts`. Preferir mover logica aca antes que engordar un componente.
- `src/lib/api.ts`: cliente HTTP (fetch con `authJson(token)` y `responseError`).
  Agregar ahi las funciones nuevas siguiendo los ejemplos existentes. Dominios grandes
  pueden tener su propio `api.ts` (ej. `src/supplier-payables/api.ts`,
  `src/lib/price-lists-api.ts`).
- `src/workspace-shell.tsx`: shell principal y navegacion (`?pagina=...`). Es muy
  grande (~7.600 lineas): agregar componentes nuevos en archivos propios e
  integrarlos con cambios minimos en el shell.
- Tipos compartidos con la API: `@gestion/contracts` (`packages/contracts`).
- Importes llegan como string de centavos; convertir solo para mostrar.

## Operaciones con reintento

Para ventas, cobros, pagos, recepciones o distribuciones: generar el `requestId` UUID
una vez por intento logico, conservar el payload enviado y, ante resultado incierto
(red/500), bloquear la edicion y ofrecer reintentar la misma solicitud. Bloquear
doble clic mientras hay una solicitud en curso. Ver `docs/BUSINESS_RULES.md`.

## UI y diseno responsive

- Tailwind 4 + componentes estilo shadcn/ui (`components.json`), iconos `lucide-react`.
- Respetar los cortes de `docs/WORKSPACE.md` (1800/1600/1440/1200/1024/768 px CSS),
  `workspace-split` para listado + formulario, sin scroll horizontal del documento.
- Accesibilidad: `aria-label` en inputs y botones de icono; los tests lo verifican.

## Tests

Vitest en entorno node: los tests de componentes usan
`renderToStaticMarkup` de `react-dom/server` y verifican el HTML (ver
`sale-quantity-input.test.tsx`). La logica se testea directamente en `src/lib`.

```powershell
pnpm --filter @gestion/web test
pnpm --filter @gestion/web typecheck
```

Los tests no sustituyen la validacion visual: si el cambio es visual, decir que falta
probarlo en navegador (o probarlo con `pnpm dev` si es posible).

## Al terminar

Seguir la skill `cerrar-tarea`.
