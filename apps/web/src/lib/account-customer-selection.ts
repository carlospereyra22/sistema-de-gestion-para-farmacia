// La cuenta abierta siempre la elige el usuario: al recargar se conserva si el
// cliente sigue existiendo y, si no, se vuelve a la lista sin saltar a otro.
export const keepAccountSelection = (
  accounts: { id: string }[],
  selectedId: string,
) => (accounts.some((account) => account.id === selectedId) ? selectedId : "");

export type AccountCreditFilter = "all" | "with" | "without";
export const matchesCreditFilter = (
  account: { creditEnabled: boolean },
  filter: AccountCreditFilter,
) => filter === "all" || account.creditEnabled === (filter === "with");

type Actor = { id: string; name: string | null } | null | undefined;
const noActor = "none";
// Sin nombre, por ejemplo si ya no integra la organización, no hay dato que
// mostrar: nunca se reemplaza por el correo.
const actorKey = (actor: Actor) => (actor?.name ? actor.id : noActor);
export const actorName = (actor: Actor) => actor?.name || "Sin datos";
export const matchesActorFilter = (actor: Actor, filter: string) =>
  filter === "all" || actorKey(actor) === filter;
export const actorFilterOptions = (actors: Actor[], prefix: string) => {
  const named = new Map<string, string>();
  for (const actor of actors) if (actor?.name) named.set(actor.id, actor.name);
  return [
    { value: "all", label: `${prefix}: todos` },
    ...[...named]
      .sort(([, a], [, b]) => a.localeCompare(b, "es"))
      .map(([value, name]) => ({ value, label: `${prefix}: ${name}` })),
    ...(actors.some((actor) => actorKey(actor) === noActor)
      ? [{ value: noActor, label: `${prefix}: sin datos` }]
      : []),
  ];
};
// Una opción puede desaparecer al recargar: se vuelve a todos, no a una lista vacía.
export const validActorFilter = (
  options: { value: string }[],
  filter: string,
) => (options.some((option) => option.value === filter) ? filter : "all");

// Un cliente creado desde Cuentas corrientes nace con la cuenta habilitada, pero
// con tope cero hasta definir el límite: null significaría crédito sin límite.
export const newCustomerCredit = {
  enabled: true,
  creditLimitMinor: 0,
} as const;
