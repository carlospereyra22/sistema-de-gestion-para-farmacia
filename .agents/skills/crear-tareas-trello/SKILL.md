---
name: crear-tareas-trello
description: Convertir un plan de trabajo del sistema de farmacia en tarjetas de Trello (titulo, descripcion, etiquetas y checklist) y crearlas en el tablero del equipo con la API de Trello. Usar cuando el usuario pida crear, cargar o pasar tareas a Trello.
---

# Crear tareas en Trello

## 1. Armar las tareas

- Partir del plan acordado (por ejemplo `docs/<TEMA>_PLAN.md`). Si no hay plan, escribirlo
  primero y mostrarselo al usuario.
- **Preferencia del equipo: una tarjeta por funcionalidad** (por ejemplo "Modificar la
  vista de Reportes"), con el plan en la descripcion. No partir una funcionalidad en
  muchas tarjetas salvo que el usuario lo pida.
- Funcionalidad grande = **epic**: etiqueta `Epic`, plan en la descripcion y checklist
  `Tareas` con un item por PR, en orden. Quien toma un item lo convierte en tarjeta
  (**··· -> Convertir en tarjeta**) y la mueve por las listas; la epic pasa a
  `Terminada` cuando todo el checklist esta tildado. Agregar items al checklist
  existente, sin borrar ni reordenar los que cargo el equipo.
- Si la tarjeta ya existe en el tablero, **escribir en esa tarjeta** (`"update": true`)
  en lugar de crear otra.
- Titulo corto en espanol, como lo escribe el equipo.
- Descripcion (Markdown):
  - **Objetivo**: una o dos frases.
  - **Referencias**: docs de `docs/` que mandan.
  - **Tareas**: lista numerada corta, una linea por paso.
  - Limitaciones conocidas (datos que no existen, decisiones pendientes).
- Checklist "Hecho cuando": criterios verificables (endpoint con tests, pantalla
  responsive, `cerrar-tarea` ejecutada, docs actualizadas).
- Etiquetas usadas por el equipo: `API`, `Web`, `Prisma`, `Docs`, `Bug`. Solo se asignan
  si ya existen en el tablero; el script no crea etiquetas.
- Orden: las tarjetas se crean en el orden del archivo; poner primero las que
  desbloquean a otras e indicar dependencias en la descripcion (`Depende de: ...`).

## 2. Archivo de tareas

Guardar en el scratchpad (no en el repo) un JSON con esta forma:

```json
{
  "list": "Sin Asignar",
  "cards": [
    {
      "title": "Modificar la vista de Reportes",
      "card": "https://trello.com/c/Fa95BEKc",
      "description": "**Objetivo**: ...\n\n**Tareas**\n\n1. ...",
      "labels": ["Web"],
      "checklist": ["Opcional: criterios de Hecho cuando"]
    }
  ]
}
```

- `card` (link o shortLink): actualiza **esa** tarjeta exacta y **reemplaza su
  descripcion** (no la mueve de lista). Es la forma preferida: pedirle el link al
  usuario. Si la tarjeta no es del tablero configurado, el script se detiene.
- `update: true` sin `card`: busca la tarjeta por titulo; se detiene si hay cero o
  mas de una con ese titulo.
- Sin `card` ni `update`: crea una tarjeta nueva en `list`.
- `members`: `["me"]` asigna al dueno del token; tambien acepta usernames de miembros
  del tablero.
- `epic`: `{ "card": "<link de la epic>", "item": "<texto exacto del item>" }`. Hace
  lo mismo que **Convertir en tarjeta**: adjunta la epic a la tarjeta nueva y reemplaza
  el item del checklist de la epic por el link de la tarjeta.
- Tareas de codigo: titulo `SISTEMA-<N> <Area>: <tarea>` y la rama
  `feature/SISTEMA-<N>` en la descripcion. N sigue al ultimo usado (ver
  `git branch -a` y las tarjetas del tablero).
- Si la simulacion avisa que la tarjeta ya tiene descripcion, mostrarsela al usuario y
  confirmar antes de reemplazarla.
- `labels` y `checklist` son opcionales; `checklist` agrega una lista "Hecho cuando"
  (`checklistName: "Tareas"` para las epics).

Tablero del equipo: **Farmatec**, en el Espacio de trabajo Farmatec
(`TRELLO_BOARD_ID=avFwigUE`). Hay otro tablero viejo con el mismo nombre en "GRUPO 2
Diseño de sistemas" (`UTsTPowi`): no usarlo. Flujo de listas:
`Sin Asignar` -> `En proceso` -> `Terminada` -> `Prueba` -> `Produccion`. Las tarjetas
nuevas van siempre a `Sin Asignar`; cada desarrollador las mueve al tomarlas. Antes de
crear, revisar que no exista ya una tarjeta equivalente en el tablero.

## 3. Mostrar y confirmar

Mostrar al usuario la lista de titulos y la lista destino, y **esperar confirmacion**
antes de crear: las tarjetas quedan visibles para todo el equipo.

## 4. Crear las tarjetas

Variables de entorno necesarias (cada desarrollador en su maquina, nunca en el repo ni
en `.env` versionado). Se obtienen en https://trello.com/power-ups/admin: **Nuevo** ->
marcar "Mi aplicacion no usa funciones de Power-Up" -> elegir el Espacio de trabajo ->
**Crear** -> **Generar una nueva clave de API** -> copiar la clave -> enlace **Token** ->
**Permitir** -> copiar el token.

- `TRELLO_API_KEY`
- `TRELLO_TOKEN`
- `TRELLO_BOARD_ID` (id o shortLink del tablero, el codigo de la URL `trello.com/b/<id>/...`)

Primero simular, despues crear:

```powershell
node .agents/skills/crear-tareas-trello/crear-tarjetas.mjs <ruta-al-json> --dry-run
node .agents/skills/crear-tareas-trello/crear-tarjetas.mjs <ruta-al-json>
```

- `--dry-run` valida el JSON, la lista, las etiquetas y si cada tarjeta se va a crear o
  actualizar, sin tocar nada.
- Si faltan las variables, no inventarlas: pedirselas al usuario o entregarle las tareas
  en texto para cargarlas a mano.
- Si la lista no existe, el script se detiene y muestra las listas del tablero.

## 5. Informe

Pasar al usuario los links de las tarjetas creadas y cualquier etiqueta que no se haya
encontrado. Si fallo a mitad de camino, decir cuales se crearon para no duplicarlas al
reintentar.
