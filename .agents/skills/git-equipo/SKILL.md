---
name: git-equipo
description: Flujo de trabajo con git y GitHub para el equipo de dos desarrolladores del sistema de farmacia - ramas, pull requests, merge a main, actualizar la rama y resolver conflictos. Usar cuando el usuario pregunte como subir cambios, hacer merge, crear un PR, sincronizar con su companero o resolver un conflicto.
---

# Flujo de git del equipo

Repositorio: `github.com/carlospereyra22/sistema-de-gestion-para-farmacia`.
Rama principal: `main` (no `master`). Somos dos desarrolladores; uno usa Claude Code y
el otro Codex. Explicar con pasos concretos y comandos; el equipo esta aprendiendo git.

## Ciclo normal

1. Partir de `main` actualizado:
   ```bash
   git checkout main
   git pull
   git checkout -b feature/SISTEMA-<N>
   ```
2. Trabajar y commitear en la rama (commits chicos y con mensaje claro).
3. Antes de subir, traer lo nuevo de `main` para detectar conflictos en tu PC:
   ```bash
   git pull origin main
   ```
4. Correr los checks (skill `cerrar-tarea`) y subir:
   ```bash
   git push -u origin feature/SISTEMA-<N>
   ```
5. Abrir el Pull Request en GitHub (`base: main` <- `compare: feature/...`), o con
   `gh pr create --base main`. Describir que cambia y que no se pudo probar.
6. El companero revisa ("Files changed") y aprueba o comenta.
7. Merge desde GitHub ("Merge pull request"). Luego borrar la rama remota.
8. Ambos actualizan su `main` local con `git checkout main && git pull`.

## Reglas

- Nunca trabajar ni hacer push directo a `main`.
- Una rama por tarea; ramas cortas (dias, no semanas).
- Nombre de rama: `feature/SISTEMA-<N>`, con N correlativo (SISTEMA-1, SISTEMA-2, ...).
  N es el de la tarjeta de Trello; si no hay tarjeta, el siguiente al ultimo usado
  (`git branch -a`). Los commits empiezan con `SISTEMA-<N>`.
- No usar `git push --force` en ramas compartidas ni en `main`.
- No commitear `.env`, claves, dumps ni archivos de prueba (ej. `test.txt`).
- Avisar al companero si la rama toca archivos "calientes": `apps/api/prisma/schema.prisma`,
  `apps/web/src/workspace-shell.tsx`, `apps/web/src/lib/api.ts`, `pnpm-lock.yaml`,
  `docs/BUSINESS_RULES.md`.

## Conflictos

- Git marca el archivo con `<<<<<<<`, `=======`, `>>>>>>>`. Elegir/combinar el
  contenido correcto, borrar los marcadores, `git add <archivo>` y `git commit`.
  VS Code ofrece "Accept Current / Incoming / Both" y el editor de merge.
- `pnpm-lock.yaml`: no editar a mano. Aceptar la version de `main` y correr
  `pnpm install` para regenerarlo, luego commitear.
- `schema.prisma` y migraciones: seguir la skill `migracion-prisma`.
- Docs (`BUSINESS_RULES.md`, `DECISIONS.md`): normalmente conservar ambos parrafos.
- Despues de resolver, volver a correr typecheck y tests.

## Problemas comunes

- `Make sure you configure "user.name" and "user.email"`:
  `git config --global user.name "..."` y `git config --global user.email "..."`.
- `git` no reconocido en la terminal: Git esta instalado pero la terminal se abrio
  antes de agregarlo al PATH; reiniciar VS Code.
- "Your branch is behind": `git pull`.
- Un agente no hace commit, push, merge ni force-push sin que el usuario lo pida.
