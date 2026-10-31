# Sistema de Gestion

Sistema de gestion comercial multi-organizacion y multi-sucursal, construido de forma incremental.

## Publicar producción

Doble clic en **Publicar Produccion.cmd**: verifica el código, respalda y actualiza
el backend del VPS y, si queda saludable, prepara **SUBIR-A-NETLIFY** para subirla
manualmente al sitio existente. Requiere confirmar y hacerlo fuera del horario
de cobros. [Instrucciones y recuperación](docs/PUBLICAR_PRODUCCION.md).

## Current status

La fundacion de aplicaciones, el modelo Prisma, la primera migracion y el seed estan listos. El entorno actual usa PostgreSQL 18 nativo porque Docker/WSL no es estable en esta computadora.

## Requirements

- Node.js 24 LTS
- pnpm 11
- Git
- Docker Desktop con PostgreSQL 18, o PostgreSQL 18 nativo, para completar la persistencia

## Installation

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

## Development

En este equipo Windows, hacé doble clic en **Iniciar Gestion - Pruebas.cmd** para iniciar la app local y abrir el navegador. Ver [inicio de pruebas](docs/INICIAR_PRUEBAS.md) para crear un acceso directo y resolver problemas.

```powershell
pnpm dev
```

Web: `http://localhost:5173`.
API: `http://localhost:3000/api/v1/health`.

## Impresión de tickets

Ventas y cobros imprimen directamente con un clic usando el formato RAW V21 de 80 mm. El componente local se inicia automáticamente y supervisa su recuperación. Encabezado configurable en Organización y nombre de quien atiende en Usuarios. Ver [configuración, datos y prueba física](docs/THERMAL_TICKETS.md).

## Database scripts

```powershell
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

Con PostgreSQL nativo, definir `DATABASE_URL` en `apps/api/.env` y ejecutar `pnpm db:migrate`; no ejecutar `db:up` ni `db:down`.

## Quality commands

```powershell
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
