# Modo sin internet

Epic "Modo sin internet" (Trello `fbGUWeIg`). Objetivo: que la farmacia siga
vendiendo sin conexión y que todo se sincronice solo al volver. Se construye
por etapas; este documento dice qué hay hoy y cómo funciona.

## Decisiones del usuario (07/11/2026)

- Ventas hechas sin conexión que choquen al sincronizar (precio cambiado, stock
  que no alcanza, límite de crédito): se registran con el precio cobrado y
  quedan "a revisar". Nunca stock negativo.
- Factura C pedida sin conexión: ticket provisorio y CAE automático al volver
  (cola fiscal, SISTEMA-61). El Ticket nunca va a ARCA.
- Funcionan sin conexión: ventas, ingresos y egresos de caja, ventas y cobros
  de cuenta corriente, consulta de stock y precios. Abrir y cerrar caja,
  compras, recepciones, transferencias y catálogo necesitan conexión.
- Cobro de cuenta corriente mayor a la deuda al sincronizar: saldo a favor y aviso.
- Una PC trabaja sin conexión hasta 24 horas desde la última sincronización.

## Etapas

| Etapa                                                         | Estado     |
| ------------------------------------------------------------- | ---------- |
| SISTEMA-59 Facturas que no llegaron a ARCA no traban el punto | En main    |
| SISTEMA-61 Cola fiscal automática                             | PR         |
| SISTEMA-62 La app abre sin conexión (consulta)                | Esta etapa |
| Recibir ventas hechas sin conexión (API)                      | Pendiente  |
| Vender sin conexión y sincronizar solo (web)                  | Pendiente  |
| Caja y cuenta corriente sin conexión                          | Pendiente  |

## Cómo funciona (SISTEMA-62)

- **La app guardada en la PC**: un service worker (`vite-plugin-pwa`) guarda
  los archivos de la app para abrirla sin conexión. Nunca guarda respuestas de
  la API. Una versión nueva se ofrece con un aviso ("Actualizar") y nunca
  recarga sola.
- **Detectar sin conexión** (`lib/conectividad.ts`): error de red, tiempo
  agotado, 502/503/504 o una página de error HTML de un proxy. Un error propio
  de la API (400, 403, 409…) no es falta de conexión. Sin conexión se pregunta
  a `/health` cada 15 segundos.
- **Copia local** (`lib/cache-local.ts`, IndexedDB): `apiFetch` guarda las
  respuestas de sucursales, productos, listas y precios efectivos, packs,
  clientes, stock, caja, cuentas corrientes, opciones fiscales, estado de la
  suscripción y encabezado del ticket. Se separa por usuario (y los datos por
  organización y sucursal, que van en la dirección). Sin conexión devuelve lo
  guardado; las operaciones que escriben fallan con "Sin conexión: esta
  operación necesita internet".
- **Actualización**: cada consulta que sale bien reemplaza la copia. El shell
  además actualiza al volver la conexión y cada 10 minutos, así entran los
  precios de las 9 y las 17.
- **Abrir sin conexión**: si no se puede renovar la sesión por falta de
  conexión (no por sesión vencida) y el último usuario de la PC sincronizó hace
  menos de 24 horas, la app abre con su perfil guardado y un token local que
  nunca sale a la red. Apenas el servidor responde, se recupera la sesión real.
  Usuarios de la plataforma y con cambio de contraseña pendiente no abren sin
  conexión.
- **Cerrar sesión**: borra la copia en el momento. Si no hay conexión, el
  servidor se entera en el próximo arranque con conexión. Si entra otra
  persona en la PC, se borra la copia del usuario anterior.
- **Aviso**: "Sin conexión · datos de las HH:MM" en el encabezado; al tocarlo
  explica qué se puede hacer.

## Cómo probarlo

El service worker no corre con `pnpm dev`: se prueba con la versión compilada.

```powershell
# Con la API local corriendo (Iniciar Gestion - Pruebas.cmd)
$env:VITE_API_URL = "/api/v1"
pnpm --filter @gestion/web build
pnpm --filter @gestion/web exec vite preview --port 4173
```

Abrir http://localhost:4173, entrar y pasar por Ventas e Inventario. Para
cortar: cerrar la API, o DevTools → Network → Offline. Recargar: la app abre
con los datos guardados y el aviso. Volver a levantar la API: en hasta 15
segundos dice "Reconectando…" y vuelve a la normalidad. La copia y el service
worker se ven en DevTools → Application.
