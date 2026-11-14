# Escalabilidad: diagnóstico y etapas (SISTEMA-106)

Revisión del 14/11/2026. Pregunta: qué pasa cuando haya muchas farmacias en el
mismo servidor. Hoy hay una farmacia en producción; el objetivo es superar las 100. Epic en Trello: "Escalabilidad y despliegue".

## Punto de partida

Un VPS gratuito de Oracle con todo adentro: un proceso Node (systemd) con la
API y las tareas programadas, PostgreSQL nativo, el ambiente de test (preprod)
y el respaldo diario, que restaura una copia entera en la misma máquina. La
web está en Netlify y llega a la API por un proxy a la IP del servidor.

## Lo que ya escala bien

- Catálogo, stock y costos por partes con versiones (`RENDIMIENTO.md`).
- Historiales acotados a 90 días y sumas resueltas en PostgreSQL.
- Idempotencia de ventas, cobros y recepciones; cola fiscal segura con dos
  instancias; la corrida global de precios es única por índice en la base.
- La API **no guarda estado de sesión en memoria**: puede correr en varias
  copias sin rediseño. Las cachés en memoria son sólo de datos públicos.

## Riesgos, de mayor a menor

| #   | Problema                                                                                                                                        | Dónde                                                                                       | Efecto con muchas farmacias                                                                    | Estado                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Un solo proceso hace todo: API, precios (09 y 17 h, todas las farmacias, transacciones de hasta 120 s), cola fiscal y cargos                    | `catalog-price-refresh.service.ts`, `cola-fiscal.service.ts`, `platform-billing.service.ts` | Mientras corre precios se enlentecen las ventas de todos; un núcleo usado; una caída tira todo | Resuelto en código (SISTEMA-106)         |
| 2   | Las versiones recalculan `md5(string_agg(...))` de todo el catálogo, stock y costos de la organización en cada consulta (~0,4 s de CPU de base) | `catalog.service.ts`, `inventory.service.ts`                                                | Con 300 PCs es el mayor consumo de CPU de PostgreSQL                                           | Etapa A                                  |
| 3   | Sin tope de conexiones ni pooler; 19 transacciones `Serializable` y varias largas                                                               | `prisma.service.ts`                                                                         | El pool se agota: pedidos esperando y errores de tiempo                                        | Tope por proceso (SISTEMA-106); pooler D |
| 4   | 3 o 4 consultas fijas por pedido: sesión, sucursal, suscripción y membresía                                                                     | `auth/`, `platform/`                                                                        | Carga base constante                                                                           | Etapa A                                  |
| 5   | Login sin límite de intentos (argon2 es caro a propósito)                                                                                       | `auth.controller.ts`                                                                        | Fuerza bruta y CPU saturada con pocos pedidos                                                  | Resuelto (SISTEMA-106)                   |
| 6   | Fotos (`ProductImage.content`) y tickets (`PrintJob.rawPayload`) dentro de PostgreSQL                                                           | `schema.prisma`                                                                             | Base y respaldos crecen GB por farmacia; el respaldo exige el doble de disco                   | Etapa B                                  |
| 7   | Toda la API pasa por el proxy de Netlify hacia una IP con certificado de pocos días                                                             | `apps/web/public/_redirects`                                                                | Salto extra; cupo y tiempo máximo de Netlify; la API ve la IP de Netlify                       | Etapa C                                  |
| 8   | Publicar detiene la API; la web se sube a mano; sin CI                                                                                          | `deploy/oracle/update-release.sh`                                                           | Con 100 farmacias no hay horario sin cobros                                                    | Parcial (reinicio de a una copia)        |
| 9   | Sin métricas, alertas ni registro de consultas lentas; muchos listados sin tope                                                                 | toda la API                                                                                 | Los problemas se descubren cuando llama la farmacia                                            | Etapas A y C2                            |
| 10  | Servidor gratuito único: sin garantía, Oracle puede recuperar la instancia; la copia fuera del servidor depende de una PC con Windows encendida | `deploy/oracle/backups/`                                                                    | Punto único de falla, ya con datos de un cliente                                               | Etapa D                                  |

## Arquitectura elegida

Sigue siendo un monolito modular: no se parte en microservicios (`AGENTS.md`).
Lo que se separa son **procesos de una misma imagen**:

```
nginx del servidor (TLS, gzip) ──► api-1 (127.0.0.1:3000) ┐
                                 ► api-2 (127.0.0.1:3002) ├─► PostgreSQL
                                   worker (sin puerto)    ┘
                                   migrate (al publicar)
```

- **api-1 y api-2**: atienden pedidos, con las tareas programadas apagadas.
- **worker**: precios, cola fiscal y cargos de suscripción. Una sola copia.
- **migrate**: `prisma migrate deploy` como paso de la publicación.
- La web sigue siendo estática y no se pone en contenedores.

Detalle y operación en `DOCKER.md`.

## Qué hacer ahora y qué no

Con una sola farmacia no conviene construir para 100. Criterio: hacer ahora lo
que es barato hoy y caro con clientes; el resto, cuando lo pida una medición.

| Etapa                                                                                                     | Cuándo                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Docker y procesos** (hecho en código); pase a test y después a producción                               | Ahora, con autorización y fuera del horario de cobros                                           |
| **Respaldo fuera del servidor comprobado**                                                                | Ahora: ya hay datos de un cliente en un servidor sin garantía                                   |
| **C. Dominio propio**: `app.` para la web y `api.` directo al servidor, sin proxy; web a Cloudflare Pages | Cuanto antes: cambiar la dirección reinicia la app instalada y la copia sin conexión de cada PC |
| **D. Servidor pago** (4 vCPU / 8 GB en San Pablo o Santiago) y base administrada o en máquina aparte      | Con el primer cliente que pague, o ante el primer aviso de Oracle                               |
| **A. Rendimiento de código**: versiones sin md5, caché corta por pedido, `pg_stat_statements`, carga HTTP | Al medir lentitud real o cerca de 20–30 farmacias                                               |
| **B. Fotos y tickets fuera de la base**; retención de `PrintJob` y `AuditLog`                             | Cuando la base pase de unos GB o el respaldo tarde demasiado                                    |
| **C2. Operación**: CI en GitHub Actions, aviso de caída, errores, disco, respaldos automáticos a la nube  | Antes de la décima farmacia                                                                     |
| Réplica de lectura para Reportes, PgBouncer, balanceador                                                  | Pasadas las 100, si las mediciones lo piden                                                     |

## Integraciones externas (obras sociales, PAMI, recetas electrónicas)

Están previstas y todavía no se diseñaron; esto sólo fija dónde encajan para
que no obliguen a rehacer la arquitectura. Son, como ARCA, sistemas ajenos que
pueden tardar, caerse o responder dos veces. Van como **módulos del monolito**
con el patrón que Fiscal ya usa (`ARCHITECTURE.md`, cola fiscal):

- Nunca una transacción de la base abierta mientras se espera al sistema
  externo: guardar el pedido, confirmar, llamar, guardar la respuesta.
- Tiempo máximo y tamaño máximo en cada llamada; sin reintentos automáticos
  de operaciones que no sean idempotentes (una validación incierta se
  consulta, no se reenvía).
- Lo pendiente queda en una tabla y lo reintenta una tarea del **worker**,
  con su variable de apagado. La venta en el mostrador no espera a un
  validador lento más que su tiempo máximo.
- Credenciales por farmacia cifradas con el mismo resguardo que las fiscales
  (`CredentialVault`), separadas por ambiente; test nunca apunta a producción.
- Respuestas y errores auditados, sin guardar secretos ni datos de salud que
  no hagan falta.

Dos consecuencias para la infraestructura: varios validadores autorizan por
**IP de origen**, así que conviene una IP fija y propia (otro motivo para el
servidor pago y el dominio); y cada integración suma conexiones salientes y
memoria al worker, que se puede dimensionar aparte de la API.

## Modo sin internet

Ventas, productos, caja, cuentas, compras y transferencias funcionan sin
conexión (`OFFLINE.md`). Se revisó que la separación en procesos no lo afecte:
el registro de cada operación sin conexión, las claves de cada PC y las
sesiones viven en PostgreSQL, no en la memoria de un proceso, así que
sincronizar contra dos copias es seguro. Una publicación con pausa se ve desde
la farmacia como una caída breve: la web pasa a sin conexión y sincroniza al
volver. El detalle y lo que falta probar están en `OFFLINE.md`, "Con la API en
Docker y dos copias".

A futuro, el modo sin internet condiciona tres decisiones: no cambiar la
dirección de la web más de una vez, mantener la hora sincronizada entre
servidores y no poner cachés de permisos o sesión que tarden más de unos
segundos en enterarse de un cambio.

## Web: Netlify

Netlify sirve bien la web estática. El problema es la línea de proxy de
`_redirects`: toda la API pasa por Netlify. Por ahora se queda. Al tener
dominio, la web llama directo a `api.<dominio>` (mismo sitio: la cookie
`SameSite=Strict` sigue valiendo y la API ya admite CORS con credenciales) y se
puede mudar a Cloudflare Pages, sin tope de ancho de banda para estáticos. La
mudanza se hace **una sola vez**: avisar que sincronicen las ventas sin
conexión antes, porque la copia local queda atada a la dirección del sitio.

## Hosting

- **Hoy**: Oracle gratuito. Riesgos: sin garantía de servicio, la instancia
  puede ser recuperada por Oracle y todo (app, base, respaldo local) está en el
  mismo disco. Mitigación mínima: copia diaria fuera del servidor comprobada.
- **Siguiente**: un VPS pago en Sudamérica (latencia baja desde Argentina) con
  la app, y la base en un servicio administrado con recuperación a un punto en
  el tiempo o en otra máquina. Con Docker el traslado es instalar Docker, copiar
  `deploy/docker/`, restaurar el respaldo y cambiar el DNS.

## Mantenimiento

- Publicar: `publicar-ambientes` (skill) y `DOCKER.md`. Siempre test primero.
- Diario: `docker compose ps` y logs; respaldo con `gestion-backup.service`.
- Parches del sistema: actualizaciones automáticas de seguridad de Ubuntu y
  reconstruir la imagen al menos una vez por mes para tomar parches de Node.
- Capacidad: mirar CPU, memoria, disco y conexiones de PostgreSQL
  (`SELECT count(*) FROM pg_stat_activity`) antes de sumar farmacias.

## Límites de esta etapa

- El límite de login vive en memoria de cada copia: con dos copias el tope
  real es el doble y se reinicia al publicar. Alcanza contra fuerza bruta.
- Con migraciones pendientes la publicación sigue teniendo una pausa. Para
  evitarla, las migraciones tienen que ser compatibles con la versión anterior
  (agregar antes de quitar); es una disciplina, no un cambio de herramienta.
- No se midió con Docker ni por HTTP: sigue pendiente la prueba de
  `RENDIMIENTO.md` con varias PCs reales.
