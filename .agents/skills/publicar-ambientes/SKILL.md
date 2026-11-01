---
name: publicar-ambientes
description: Como se maneja el codigo entre ambientes (test y produccion, y a futuro preproduccion) - un solo repo y una sola rama main, versiones con tags, que se publica en cada ambiente, checklist antes de produccion, hotfix y migraciones. Usar cuando el usuario pregunte como publicar, que version esta en cada ambiente, como sacar una version, crear un tag, hacer un hotfix o pasar algo de test a produccion.
---

# Ambientes y publicacion

Explicar con pasos concretos y comandos; el equipo esta aprendiendo git. Esta skill
complementa `git-equipo` (ramas y PR) y no reemplaza los procedimientos de
`docs/PUBLICAR_PRODUCCION.md` y `docs/PREPRODUCCION.md`.

## Ambientes actuales

| Ambiente   | Para que                      | API (VPS)                                 | Web (Netlify)                                     | Publicar con                 |
| ---------- | ----------------------------- | ----------------------------------------- | ------------------------------------------------- | ---------------------------- |
| Local      | Desarrollo                    | `localhost:3000`, base `gestion_dev`      | `localhost:5173`                                  | `pnpm dev`                   |
| Test       | Probar lo ultimo de `main`    | `gestion-preprod-api`, `/preprod/api/v1/` | sitio aparte, carpeta `SUBIR-A-NETLIFY-PREPROD`   | `Publicar Preproduccion.cmd` |
| Produccion | Clientes reales, datos reales | `gestion-api`, `/api/v1/`                 | `sistema-de-gestion22`, carpeta `SUBIR-A-NETLIFY` | `Publicar Produccion.cmd`    |

**Ojo con el nombre:** el ambiente que en scripts, servicio, base y docs se llama
"preprod" / "preproduccion" **funciona como test**. El cambio de nombre esta
pendiente y es una tarea propia (ver "Futuro"); no renombrar nada como efecto
colateral de otra tarea. Al hablar con el usuario, llamarlo "test (hoy llamado
preprod)".

Una preproduccion real todavia no existe.

## Modelo: un repo, una rama, versiones con tags

- Un solo repositorio y una sola rama principal, `main`. **No crear ramas por
  ambiente** (`test`, `prod`, `release`...): se desfasan y nunca se sabe que se probo.
- Lo que viaja entre ambientes es un **commit de `main`**, identificado con un tag.
- Lo que cambia entre ambientes es la **configuracion** (variables de entorno en cada
  servidor, base, credenciales, sitio de Netlify), nunca el codigo.
- Cada ambiente tiene base, JWT, usuarios y respaldos propios. No copiar datos de
  produccion a test. Emision fiscal real solo en produccion.

## Versiones (tags)

- Formato `vMAJOR.MINOR.PATCH`, con tags anotados:
  - PATCH (`v1.4.1`): solo correcciones.
  - MINOR (`v1.5.0`): funcionalidades nuevas compatibles.
  - MAJOR (`v2.0.0`): cambios que obligan a algo manual (ej. actualizar agentes de
    impresion en las PC, migraciones que cambian el uso).
- Ver tags existentes: `git fetch --tags` y `git tag --list --sort=-v:refname`.
- Crear y subir (solo cuando el usuario lo pida):
  ```bash
  git checkout main
  git pull
  git tag -a v1.5.0 -m "v1.5.0 - SISTEMA-8, SISTEMA-9, SISTEMA-10"
  git push origin v1.5.0
  ```
- Un tag publicado no se mueve ni se borra. Si hay que corregir algo, se saca el
  siguiente (`v1.5.1`).
- Todavia no hay tags. El primero se crea en la proxima publicacion a produccion,
  sobre el commit que efectivamente se publique. No etiquetar commits viejos
  adivinando cual esta en produccion.

### Coordinacion entre los dos desarrolladores

- `git push` **no sube tags** y `git pull` no siempre los trae: subir con
  `git push origin vX.Y.Z` y traer con `git fetch --tags`.
- Crea el tag **solo quien va a publicar produccion**, en ese momento. Nadie crea
  tags para probar ni "por las dudas".
- Antes de publicar, avisar al companero (WhatsApp o la tarjeta de Trello), por
  ejemplo: "Voy a publicar v1.1.0 en prod con SISTEMA-8, 9 y 10". Asi no publican
  los dos a la vez ni se etiqueta en medio de un merge.
- El numero sale del ultimo tag existente (`git fetch --tags` y
  `git tag --list --sort=-v:refname`), no de memoria.
- Si los dos crean el mismo tag, el segundo `git push origin vX.Y.Z` falla con
  `rejected ... already exists`. Ese, que nunca se subio, se borra local con
  `git tag -d vX.Y.Z`, se hace `git fetch --tags` y se acuerda el numero. Es el
  unico caso en que se borra un tag.
- Para saber que hay en produccion: `git fetch --tags` y el primer tag de la lista,
  o en GitHub la seccion **Tags** / **Releases** del repo.

| Situacion                  | Comando                                                 |
| -------------------------- | ------------------------------------------------------- |
| Ver tags                   | `git fetch --tags` y `git tag --list --sort=-v:refname` |
| Crear (solo quien publica) | `git tag -a vX.Y.Z -m "..."`                            |
| Subir                      | `git push origin vX.Y.Z`                                |
| Ver el commit de un tag    | `git show vX.Y.Z`                                       |
| Ir al codigo de un tag     | `git checkout vX.Y.Z` (y despues `git checkout main`)   |
| Lo cree mal y no lo subi   | `git tag -d vX.Y.Z`                                     |

## Flujo normal (hoy: test + produccion)

```
feature/SISTEMA-N --PR--> main --> TEST (lo ultimo de main)
                            |
                      tag vX.Y.Z --> PRODUCCION (el mismo commit probado en test)
```

1. Trabajo en `feature/SISTEMA-<N>`, PR y merge a `main` (skill `git-equipo`).
2. **Publicar a test** desde `main` actualizado y limpio:
   ```powershell
   git checkout main; git pull; git status   # debe decir "nothing to commit"
   & '.\Publicar Preproduccion.cmd'
   ```
   Subir `SUBIR-A-NETLIFY-PREPROD` al sitio de Netlify **de test**.
3. Probar en test: login, permisos, ventas de prueba, caja, cierres, carga de
   productos y lo que haya cambiado. Si algo falla, corregir por PR y volver al paso 2.
4. Cuando el usuario decide sacar version: crear el tag **sobre el mismo commit que
   quedo probado en test** (si `main` avanzo despues, etiquetar ese commit por hash:
   `git tag -a v1.5.0 <hash> -m "..."`).
5. **Publicar a produccion desde el tag** (ver checklist).

## Publicar produccion desde un tag

Los publicadores arman el paquete desde la carpeta local de quien publica,
**incluidos cambios sin commit**. Por eso siempre:

```powershell
git fetch --tags
git status                      # nada pendiente; si hay cambios, commitear o guardarlos antes
git checkout v1.5.0             # queda en "detached HEAD", es esperado
git describe --tags --exact-match   # debe imprimir v1.5.0
& '.\Publicar Produccion.cmd'
git checkout main               # al terminar, volver a main
```

Checklist antes de produccion:

- [ ] Autorizacion explicita del usuario para esta publicacion. Un agente nunca
      ejecuta `Publicar Produccion.cmd` por su cuenta (si puede usar `-PrepareOnly`).
- [ ] El tag es exactamente el commit que se probo en test.
- [ ] Arbol limpio y `git describe --tags --exact-match` devuelve el tag.
- [ ] Migraciones nuevas desde la version anterior revisadas:
      `git diff --name-only <tag-anterior> <tag-nuevo> -- apps/api/prisma/migrations`.
      Ya corrieron bien en test. Requieren pausa de API: fuera del horario de cobros.
- [ ] Si cambia el agente de impresion, avisar que hay que actualizar las PC.
- [ ] Despues: subir `SUBIR-A-NETLIFY` (no la de test) a `sistema-de-gestion22`.
- [ ] Anotar en el mensaje del tag o en un GitHub Release el id de release que
      informo el publicador (ej. `20261023-150547-a1533402`).

## Hotfix (error urgente en produccion)

1. Rama desde `main` (`feature/SISTEMA-<N>`), corregir, PR y merge.
2. Publicar a test y verificar el arreglo, aunque sea rapido.
3. Tag de PATCH (`v1.5.1`) y publicar produccion desde ese tag.

Si `main` ya tiene cosas nuevas que no se quieren publicar, crear la rama desde el
tag de produccion (`git checkout -b hotfix/v1.5.1 v1.5.0`), corregir, probar en test,
etiquetar `v1.5.1` sobre esa rama y despues mergear la rama a `main` por PR.

## Migraciones

Son codigo: viajan con el tag y se aplican en orden local -> test -> produccion.
Nunca editar una migracion ya aplicada en cualquier ambiente (skill
`migracion-prisma`). No ejecutar migraciones contra produccion fuera del publicador.

## Futuro

1. **Renombrar "preprod" a "test"**: servicio, base, rol, ruta Nginx, sitio de
   Netlify, scripts (`Preproduccion.*`, `Publicar Preproduccion.*`,
   `scripts/publicar-preproduccion.ps1`, `deploy/oracle/*preprod*`) y docs. Es un
   cambio de infraestructura en el VPS: tarea propia, con autorizacion.
2. **Agregar preproduccion real** entre test y produccion, con datos parecidos a
   produccion (anonimizados) para validar migraciones. Flujo:
   - test: lo ultimo de `main`.
   - preproduccion: candidato `vX.Y.Z-rc.N` (ej. `v1.6.0-rc.1`); si falla, se corrige
     en `main` y se saca `rc.2`.
   - produccion: `vX.Y.Z` sobre el mismo commit del ultimo rc aprobado.
3. Idealmente un solo publicador con `-Ambiente test|preprod|prod` que rechace
   arboles sucios y, para produccion, exija un tag.

Al hacer cualquiera de estos pasos, actualizar esta skill, `docs/DECISIONS.md` y la
tabla de ambientes.
