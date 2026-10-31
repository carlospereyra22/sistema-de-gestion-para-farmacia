---
name: migracion-prisma
description: Cambiar el esquema de base de datos (apps/api/prisma/schema.prisma) y crear migraciones Prisma de forma segura en el sistema de farmacia. Usar al agregar tablas, columnas, indices, constraints o datos iniciales, o al resolver conflictos de migraciones entre ramas.
---

# Cambios de esquema y migraciones Prisma

## Reglas que no se rompen

- **Nunca editar ni borrar una migracion existente** en `apps/api/prisma/migrations/`.
  Ya estan aplicadas en produccion; el despliegue verifica que no cambien
  (`deploy/oracle/check-migrations.cjs`) y aborta si difieren.
- Migraciones **aditivas**: agregar columnas nullable o con default, tablas e indices
  nuevos. No borrar columnas ni datos historicos aunque queden sin uso (documentarlo).
- No rellenar historial por inferencia: los registros viejos conservan su
  comportamiento salvo decision explicita.
- No ejecutar `prisma migrate reset`, `db push` ni el seed contra una base que no sea
  la local `gestion_dev`.

## Pasos

1. Leer `docs/DATA_MODEL.md` y la seccion del dominio en `docs/ARCHITECTURE.md`.
2. Editar `apps/api/prisma/schema.prisma` respetando:
   - PK `String @id @default(uuid()) @db.Uuid`.
   - `organizationId` en entidades comerciales, `branchId` en operaciones fisicas.
   - FKs compuestas `(id, organizationId)` cuando hay que impedir cruces entre
     organizaciones (patron usado en Category, SupplierPayable, FiscalDocument).
   - Dinero: `BigInt` en centavos (`...Minor`). Fechas civiles: `@db.Date`.
3. Crear la migracion con nombre descriptivo en snake_case:
   ```powershell
   pnpm --filter @gestion/api exec prisma migrate dev --name <descripcion>
   ```
   Se genera `YYYYMMDDHHMMSS_<descripcion>/migration.sql`. Revisar el SQL a mano.
   Constraints, indices parciales, triggers o `CHECK` que Prisma no expresa se agregan
   en ese mismo SQL antes de commitear (hay ejemplos en migraciones de 2026-10).
4. `pnpm --filter @gestion/api prisma:generate` si no se regenero el cliente.
5. Agregar tests de integracion si el cambio impone integridad (constraint, trigger).
6. Actualizar `docs/DATA_MODEL.md` (y `ARCHITECTURE.md`/`DECISIONS.md` si es una
   decision nueva).

## Trabajo en equipo (dos devs)

- Avisar al companero cuando una rama toca `schema.prisma`: es el archivo con mas
  riesgo de conflicto.
- Antes de abrir el PR: `git pull origin main` en la rama. Si `main` trajo migraciones
  nuevas:
  - Resolver el conflicto de `schema.prisma` conservando ambos cambios.
  - Si tu migracion **todavia no se aplico fuera de tu PC**, borrar solo tu carpeta de
    migracion y regenerarla (`migrate dev`) para que quede con timestamp posterior.
  - Si ya se aplico en otra base compartida, no regenerar: consultarlo antes.
- En produccion las migraciones se aplican con `prisma migrate deploy` desde
  `Publicar Produccion.cmd`, API antes que web. Un agente nunca publica sin
  autorizacion explicita.
