# Project

Sistema de gestion comercial multi-organizacion y multi-sucursal para farmacias
(Argentina): catalogo de medicamentos y productos, stock por lote/vencimiento,
ventas POS, caja, cuentas corrientes, compras, proveedores, facturacion electronica
ARCA (factura C) y tickets termicos de 80 mm.

Equipo: dos desarrolladores; uno usa Claude Code y otro Codex. Este archivo y las
skills de `.agents/skills/` son compartidos por ambas herramientas.

## Stack y estructura

Monorepo pnpm (Node 24, pnpm 11), monolito modular:

- `apps/api`: NestJS 11 REST bajo `/api/v1`, Prisma 6 + PostgreSQL 18, Jest.
  Un modulo por dominio en `src/` (accounts, auth, audit, cash, catalog, fiscal,
  inventory, organizations, parties, printing, purchases, reports, roles, sales,
  supplier-payables, transfers, users). Esquema en `prisma/schema.prisma`,
  migraciones en `prisma/migrations/`, integracion en `test/`.
  OpenAPI en `/api/docs`.
- `apps/web`: React 19 + Vite 7 + Tailwind 4 + React Router, Vitest. Componentes
  planos en `src/`, logica pura en `src/lib/`, cliente HTTP en `src/lib/api.ts`,
  shell principal `src/workspace-shell.tsx`.
- `apps/landing`: sitio comercial publico (React + Vite + Tailwind), sitio de
  Netlify propio. Ver `docs/LANDING.md`.
- `packages/contracts`: solo tipos compartidos, sin logica.
- `scripts/`: agente de impresion termica (Node, ESC/POS), lanzadores PowerShell,
  herramientas Python del catalogo externo.
- `deploy/oracle/`: despliegue del backend en VPS Oracle (systemd + nginx). La web
  se sube manualmente a Netlify.

Desarrollo local: `Iniciar Gestion - Pruebas.cmd` o `pnpm dev` (web
`localhost:5173`, API `localhost:3000`, PostgreSQL nativo `gestion_dev`).

## Indice de documentacion (`docs/`)

- Reglas y decisiones: `BUSINESS_RULES.md`, `DECISIONS.md`, `ARCHITECTURE.md`,
  `DATA_MODEL.md`, `ROADMAP.md`, `IMPLEMENTATION_STATUS.md`.
- Ventas: `SALE_UNIT_PRICE.md`, `SALE_MANUAL_CONCEPTS.md`, `SALE_CREDIT_ACTIONS.md`,
  `SALES_*.md`.
- Caja: `CASH_SIMPLE_IMPLEMENTATION.md`, `CASH_WORKSPACE.md`.
- Cuentas corrientes: `ACCOUNT_*.md`, `CUSTOMERS.md`, `CUSTOMER_BILLING.md`.
- Catalogo: `PRODUCTS.md`, `BRANCH_PRODUCT_LIFECYCLE.md`, `INVENTORY_SEARCH.md`,
  `EXTERNAL_PRODUCT_CATALOG.md`, `DASHBOARD_MEDICINE_SEARCH.md`.
- Compras y proveedores: `PURCHASES_V2.md`, `SUPPLIERS.md`, `SUPPLIER_PAYABLES.md`,
  `DISTRIBUTION.md`.
- Fiscal: `FISCAL_BILLING.md`, `PRODUCTION_FISCAL_CHECKLIST.md`, `FISCAL_*.md`.
- Impresion: `THERMAL_TICKETS.md`, `LOCAL_PRINT_AGENT.md`, `PRODUCTION_PRINTING.md`.
- Reportes: `REPORTS_PLAN.md`, `REPORTS_INTERACTIVE_SPEC.md`.
- Landing comercial: `LANDING.md`.
- Interfaz: `WORKSPACE.md`, `DASHBOARD_OVERVIEW.md`, `NOTIFICATIONS.md`.
- Operacion: `INICIAR_PRUEBAS.md`, `PUBLICAR_PRODUCCION.md`,
  `LOCAL_PRODUCTION_PARITY.md`, `NETLIFY.md`, `PRODUCTION_BOOTSTRAP.md`.

## Skills compartidas (`.agents/skills/`)

Unica carpeta de skills del proyecto, para Codex y Claude Code. No crear copias en
`.claude/skills/` ni en otro lugar. Antes de empezar una tarea, leer completo el
`SKILL.md` que corresponda:

| Tarea                                                     | Leer                                             |
| --------------------------------------------------------- | ------------------------------------------------ |
| Cambiar backend: endpoints, servicios, reglas de negocio  | `.agents/skills/nueva-funcionalidad-api/SKILL.md` |
| Cambiar frontend: pantallas, componentes, `lib/`          | `.agents/skills/nueva-funcionalidad-web/SKILL.md` |
| Cambiar `schema.prisma` o crear migraciones               | `.agents/skills/migracion-prisma/SKILL.md`        |
| Terminar cualquier cambio de codigo                       | `.agents/skills/cerrar-tarea/SKILL.md`            |
| Ramas, commits, pull requests, merge o conflictos de git  | `.agents/skills/git-equipo/SKILL.md`              |
| Crear o cargar tareas en Trello                           | `.agents/skills/crear-tareas-trello/SKILL.md`     |

Una skill nueva va en `.agents/skills/<nombre>/SKILL.md` (frontmatter `name` y
`description`) y se agrega a esta tabla.

## Working rules

- Leer `docs/BUSINESS_RULES.md` antes de modificar logica de negocio.
- Leer `docs/ARCHITECTURE.md` antes de introducir infraestructura.
- No cambiar tecnologias fundamentales sin autorizacion.
- No introducir Firebase, bases NoSQL ni microservicios.
- Mantener TypeScript estricto y evitar `any`.
- No guardar secretos ni editar migraciones ya ejecutadas.
- No eliminar registros comerciales historicos.
- Mantener modulos separados y no colocar reglas criticas solo en React.
- Toda operacion futura de base compleja debe considerar transacciones.
- Todo codigo nuevo debe compilar, tener tests cuando agregue comportamiento y actualizar documentacion si cambia una decision.
- El backend es la autoridad de precios, permisos, totales y stock. Importes en centavos `BigInt`, nunca float.
- Trabajar en ramas `feature/SISTEMA-<N>` (numero correlativo, ver `git-equipo`) y entrar a `main` por Pull Request; nunca push directo a `main`.
- No ejecutar `Publicar Produccion.cmd`, migraciones contra produccion, ni habilitar emision fiscal productiva sin autorizacion explicita del usuario.

## Before finishing a task

Ejecutar, cuando corresponda: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`.
Informar siempre lo que no haya podido verificarse.
