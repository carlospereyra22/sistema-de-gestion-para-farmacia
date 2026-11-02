---
name: cerrar-tarea
description: Checklist para terminar una tarea en el sistema de farmacia - ejecutar format, lint, typecheck, tests y build, actualizar documentacion y dejar el trabajo listo para commit/PR. Usar antes de dar por terminado cualquier cambio de codigo.
---

# Cerrar una tarea

## 1. Verificacion

Desde la raiz, en este orden:

```powershell
$archivos = @(git diff --name-only --diff-filter=ACMR HEAD) + @(git ls-files --others --exclude-standard)
if ($archivos.Count) { pnpm exec prettier --write --ignore-unknown @archivos }
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- **No correr `pnpm format`** (`prettier --write .`): reescribe todo el repo con
  finales de linea LF y, con `core.autocrlf=true` en Windows, git marca cientos de
  archivos como modificados sin cambios reales. Formatear solo los archivos de la
  tarea, como arriba. Si igual pasa, restaurar los que no son de la tarea con
  `git checkout -- <archivo>` y confirmar con `git status --short`.

- `pnpm test` incluye los tests de integracion de `apps/api/test/`, que necesitan
  PostgreSQL local `gestion_dev` y `apps/api/.env` con `DATABASE_URL`. Si la base no
  esta disponible, correr al menos los tests del paquete tocado y **avisar** que la
  integracion no se ejecuto:
  ```powershell
  pnpm --filter @gestion/api exec jest src
  pnpm --filter @gestion/web test
  pnpm test:thermal
  ```
- Lint usa `--max-warnings=0`: un warning es un error.
- TypeScript estricto, sin `any`. No silenciar errores con `// @ts-ignore` ni
  `eslint-disable` salvo justificacion.
- El aviso de tamano del bundle de Vite es conocido y no bloquea.

## 2. Documentacion

Si el cambio altera una regla o decision, actualizar en el mismo commit:

- `docs/BUSINESS_RULES.md`: reglas comerciales (fechar las nuevas: "(DD/MM/AAAA)").
- `docs/DECISIONS.md`: decisiones tecnicas o de producto.
- `docs/ARCHITECTURE.md`: infraestructura, modulos, transacciones.
- `docs/DATA_MODEL.md`: esquema.
- El documento del dominio (`docs/<TEMA>.md`) o uno nuevo si es una funcionalidad grande.

## 3. Informe final

Decir siempre:

- Que se cambio y por que.
- Que checks pasaron y cuales **no** se pudieron ejecutar (base, navegador, impresora
  fisica, ARCA, produccion).
- Que falta validar a mano (visual, hardware, datos reales).

## 4. Git

- Trabajar en una rama `feature/SISTEMA-<N>` (ver skill `git-equipo`), nunca en `main`.
- Commit solo si el usuario lo pide. Mensajes estilo convencional en espanol o ingles
  (`feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`).
- Nunca commitear `.env`, claves, dumps, `data/external-catalog/` ni `SUBIR-A-NETLIFY/`.
- Publicar en produccion (`Publicar Produccion.cmd`) solo con autorizacion explicita
  del usuario y fuera del horario de cobros. Ver `docs/PUBLICAR_PRODUCCION.md`.
