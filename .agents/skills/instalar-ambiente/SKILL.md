---
name: instalar-ambiente
description: Preparar o reparar un ambiente del sistema de farmacia - PC de desarrollo en Windows (Git, Node, pnpm, PostgreSQL, .env, migraciones, seed), Docker Desktop, PC de la farmacia, servidor de test o produccion, o un servidor nuevo. Usar cuando el usuario pida instalar el proyecto en una PC, sume un desarrollador, algo no arranque por falta de programas o configuracion, o haya que instalar Docker.
---

# Instalar un ambiente

El procedimiento completo esta en `docs/INSTALACION.md`. Esta skill dice como
aplicarlo sin romper nada.

## Antes de instalar

1. Identificar el ambiente (tabla del principio de `docs/INSTALACION.md`) y leer
   esa seccion completa.
2. Ver que hay y que falta, sin cambiar nada:
   ```powershell
   git --version; node -v; pnpm -v
   wsl -l -v; wsl docker --version
   Get-Service postgresql* | Select-Object Name, Status
   Test-Path apps/api/.env; Test-Path apps/web/.env
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/iniciar-pruebas.ps1 -CheckOnly
   ```
3. Instalar **solo lo que falta**. No reinstalar ni cambiar de version programas que
   ya funcionan (Node 24, pnpm 11, PostgreSQL 18) sin que el usuario lo pida.

## Reglas

- El desarrollo es en **Windows con PowerShell**: comandos con `winget`, rutas con
  `\`. Linux solo para el servidor.
- Instalar programas, tocar servicios de Windows o pedir permisos de administrador:
  mostrar el comando y que el usuario lo confirme o lo ejecute.
- **Nunca** escribir claves reales en el repo, la documentacion ni el chat. Los
  `.env` no se versionan; el usuario elige las claves. No copiar el `.env` de otro
  ambiente ni reutilizar el `JWT_ACCESS_SECRET` de produccion.
- No borrar ni recrear una base que ya tiene datos (`gestion_dev` incluida) sin
  autorizacion: nada de `migrate reset` por las dudas. Ante un esquema desfasado,
  seguir la skill `migracion-prisma`.
- No copiar datos de produccion a una PC ni a test.
- Las skills viven solo en `.agents/skills/`; no crear copias en `.claude/skills/`.
- Docker es opcional en la PC (solo para probar la imagen). Si no esta, el trabajo
  diario sigue con `pnpm dev`. El equipo lo instala **dentro de WSL (Ubuntu)**, sin
  Docker Desktop: los comandos `docker` van en la terminal de Ubuntu, con el repo en
  `/mnt/c/...` (desde PowerShell, `wsl docker ...`). No proponer Docker Desktop salvo
  que el usuario lo pida.
- Servidor: instalar Docker, cambiar nginx o pasar un ambiente a contenedores
  requiere autorizacion explicita y se hace primero en test. Ver skill `docker-api`.

## Comprobar que quedo bien

PC de desarrollo:

```powershell
pnpm install
pnpm --filter @gestion/api prisma:generate
pnpm lint; pnpm typecheck; pnpm test; pnpm build
```

y abrir `http://localhost:5173` con `Iniciar Gestion - Pruebas.cmd` o `pnpm dev`.

Con Docker: `docker compose version` y los pasos de "Probar en una PC" de
`docs/DOCKER.md`.

## Problemas comunes

| Sintoma                                        | Causa habitual                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm` o `git` no reconocido                   | Terminal abierta antes de instalar: cerrar y abrir VS Code                |
| La API no arranca: `DATABASE_URL`              | Falta `apps/api/.env` o la clave no coincide con el rol `gestion_dev`     |
| Tests de integracion fallan al crear esquemas  | El rol no tiene `CREATEDB` o el servicio de PostgreSQL esta detenido      |
| La web no inicia sesion en `127.0.0.1`         | Usar `localhost` (la cookie y CORS estan configurados para ese nombre)    |
| `prisma generate` falla por archivo en uso     | La API esta corriendo: detenerla y repetir                                |
| Docker: no conecta al servicio (WSL)           | `sudo systemctl start docker` dentro de Ubuntu; ver `docs/INSTALACION.md` |
| Docker: "virtualization" o WSL                 | Activar virtualizacion en el BIOS y `wsl --install`                       |
| Docker: puerto 3000 en uso                     | Detener la API de pruebas antes de levantar el compose local              |
| Cientos de archivos modificados tras formatear | Se corrio `pnpm format`: ver skill `cerrar-tarea`                         |

## Al terminar

Si el procedimiento real difirio de `docs/INSTALACION.md` (version nueva, paso que
falta), corregir el documento en la misma tarea.
