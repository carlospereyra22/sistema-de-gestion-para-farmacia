// Crea tarjetas de Trello desde un JSON. Uso:
//   node crear-tarjetas.mjs <tareas.json> [--dry-run]
// Requiere TRELLO_API_KEY, TRELLO_TOKEN y TRELLO_BOARD_ID en el entorno.
import { readFile } from "node:fs/promises";

const [file, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
if (!file) fail("Uso: node crear-tarjetas.mjs <tareas.json> [--dry-run]");

const {
  TRELLO_API_KEY: key,
  TRELLO_TOKEN: token,
  TRELLO_BOARD_ID: board,
} = process.env;
if (!key || !token || !board)
  fail("Faltan TRELLO_API_KEY, TRELLO_TOKEN o TRELLO_BOARD_ID.");

const plan = JSON.parse(await readFile(file, "utf8"));
if (typeof plan.list !== "string" || !Array.isArray(plan.cards))
  fail('El JSON debe tener "list" (texto) y "cards" (lista).');
for (const [index, card] of plan.cards.entries())
  if (typeof card.title !== "string" || !card.title.trim())
    fail(`La tarjeta ${index + 1} no tiene "title".`);

const lists = await trello("GET", `/boards/${board}/lists`);
const list = lists.find(
  (item) => item.name.trim().toLowerCase() === plan.list.trim().toLowerCase(),
);
if (!list)
  fail(
    `No existe la lista "${plan.list}". Listas: ${lists.map((item) => item.name).join(", ")}`,
  );

const labels = await trello("GET", `/boards/${board}/labels`);
const labelId = new Map(
  labels
    .filter((label) => label.name)
    .map((label) => [label.name.toLowerCase(), label.id]),
);
const missing = new Set();
const boardCards = await trello("GET", `/boards/${board}/cards`);
const { id: boardId } = await trello("GET", `/boards/${board}`, {
  fields: "id",
});
const boardMembers = await trello("GET", `/boards/${board}/members`);
const me = await trello("GET", "/members/me", { fields: "id,username" });

for (const card of plan.cards) {
  const idLabels = (card.labels ?? []).flatMap((name) => {
    const id = labelId.get(name.toLowerCase());
    if (!id) missing.add(name);
    return id ? [id] : [];
  });
  const idMembers = (card.members ?? []).map(memberId);
  const existing = await findExisting(card);
  const epic = card.epic ? await findEpicItem(card.epic) : undefined;
  if (dryRun) {
    const previous = existing?.desc
      ? ` - ya tiene descripcion de ${existing.desc.length} caracteres`
      : "";
    const parent = epic ? ` - item "${epic.item.name}" de la epic` : "";
    console.log(
      `[simulacion] ${existing ? `actualizar ${existing.shortUrl}` : "crear"}: ${card.title} (${card.checklist?.length ?? 0} items, ${idMembers.length} miembros)${parent}${previous}`,
    );
    continue;
  }
  const created = existing
    ? await trello("PUT", `/cards/${existing.id}`, {
        desc: card.description ?? "",
        ...(idLabels.length ? { idLabels: idLabels.join(",") } : {}),
        ...(idMembers.length ? { idMembers: idMembers.join(",") } : {}),
      })
    : await trello("POST", "/cards", {
        idList: list.id,
        name: card.title,
        desc: card.description ?? "",
        idLabels: idLabels.join(","),
        idMembers: idMembers.join(","),
        pos: "bottom",
      });
  // Igual que "Convertir en tarjeta": el item de la epic pasa a ser el link de la tarjeta.
  if (epic) {
    await trello("POST", `/cards/${created.id}/attachments`, {
      url: epic.card.shortUrl,
      name: `Epic: ${epic.card.name}`,
    });
    await trello("PUT", `/cards/${epic.card.id}/checkItem/${epic.item.id}`, {
      name: created.shortUrl,
    });
  }
  if (card.checklist?.length) {
    const checklist = await trello("POST", `/cards/${created.id}/checklists`, {
      name: "Hecho cuando",
    });
    for (const item of card.checklist)
      await trello("POST", `/checklists/${checklist.id}/checkItems`, {
        name: item,
      });
  }
  console.log(
    `${existing ? "Actualizada" : "Creada"}: ${card.title} -> ${created.shortUrl}`,
  );
}
if (missing.size)
  console.log(
    `Etiquetas no encontradas en el tablero: ${[...missing].join(", ")}`,
  );

// "card" (link o shortLink) identifica la tarjeta exacta; "update" sola la busca por titulo.
async function findExisting(card) {
  if (card.card) {
    const ref = card.card.match(/trello\.com\/c\/([^/?#]+)/)?.[1] ?? card.card;
    const found = await trello("GET", `/cards/${ref}`, {
      fields: "name,desc,shortUrl,idBoard",
    });
    if (found.idBoard !== boardId)
      fail(`La tarjeta ${found.shortUrl} no pertenece al tablero ${board}.`);
    return found;
  }
  if (!card.update) return undefined;
  const matches = boardCards.filter(
    (item) =>
      item.name.trim().toLowerCase() === card.title.trim().toLowerCase(),
  );
  if (matches.length !== 1)
    fail(
      `Se esperaba una tarjeta "${card.title}" y hay ${matches.length}. Usar "card" con el link.`,
    );
  return matches[0];
}

// "me" es el dueno del token; el resto, usernames de miembros del tablero.
function memberId(name) {
  if (name === "me") return me.id;
  const found = boardMembers.find(
    (member) => member.username.toLowerCase() === name.toLowerCase(),
  );
  if (!found)
    fail(
      `"${name}" no es miembro del tablero. Miembros: ${boardMembers.map((member) => member.username).join(", ")}`,
    );
  return found.id;
}

async function findEpicItem({ card: link, item: itemName }) {
  const ref = link.match(/trello\.com\/c\/([^/?#]+)/)?.[1] ?? link;
  const epicCard = await trello("GET", `/cards/${ref}`, {
    fields: "name,shortUrl,idBoard",
  });
  if (epicCard.idBoard !== boardId)
    fail(`La epic ${epicCard.shortUrl} no pertenece al tablero ${board}.`);
  const checklists = await trello("GET", `/cards/${epicCard.id}/checklists`);
  const item = checklists
    .flatMap((checklist) => checklist.checkItems)
    .find(
      (checkItem) =>
        checkItem.name.trim().toLowerCase() === itemName.trim().toLowerCase(),
    );
  if (!item)
    fail(`La epic ${epicCard.shortUrl} no tiene el item "${itemName}".`);
  return { card: epicCard, item };
}

async function trello(method, path, params = {}) {
  const url = new URL(`https://api.trello.com/1${path}`);
  for (const [name, value] of Object.entries({ ...params, key, token }))
    url.searchParams.set(name, String(value));
  const response = await fetch(url, { method });
  if (!response.ok)
    fail(
      `Trello ${method} ${path}: ${response.status} ${await response.text()}`,
    );
  return response.json();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
