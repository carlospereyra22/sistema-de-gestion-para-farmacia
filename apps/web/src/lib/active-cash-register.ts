type Register = { id: string; name: string };
type OpenSession = { id: string; cashRegisterId: string };

const storageKey = (organizationId: string, branchId: string) =>
  `gestion:cash-register:${organizationId}:${branchId}`;

/** La elección es una comodidad del equipo: sin almacenamiento, no hay elección. */
export function readCashRegisterChoice(
  organizationId: string,
  branchId: string,
  storage?: Pick<Storage, "getItem">,
): string {
  try {
    return (
      (storage ?? localStorage).getItem(storageKey(organizationId, branchId)) ??
      ""
    );
  } catch {
    return "";
  }
}

export function saveCashRegisterChoice(
  organizationId: string,
  branchId: string,
  registerId: string,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? localStorage).setItem(
      storageKey(organizationId, branchId),
      registerId,
    );
  } catch {
    // La elección dura hasta recargar la pantalla.
  }
}

/** Caja que muestra la pantalla: una caja elegida se respeta aunque esté cerrada. */
export function resolveCashRegister({
  registers,
  openSessions,
  chosen,
  defaultRegisterId,
}: {
  registers: Register[];
  openSessions: OpenSession[];
  chosen: string;
  defaultRegisterId?: string | null;
}): string {
  const available = (id?: string | null) =>
    Boolean(id) && registers.some((register) => register.id === id);
  const open = (id?: string | null) =>
    openSessions.some((session) => session.cashRegisterId === id);
  if (available(chosen)) return chosen;
  if (available(defaultRegisterId) && open(defaultRegisterId))
    return defaultRegisterId!;
  const firstOpen = openSessions.find((session) =>
    available(session.cashRegisterId),
  );
  if (firstOpen) return firstOpen.cashRegisterId;
  return available(defaultRegisterId)
    ? defaultRegisterId!
    : (registers[0]?.id ?? "");
}

/**
 * Sesión donde se cobra. Con varias abiertas y ninguna preferida no devuelve
 * ninguna: elegir al azar mandaría el dinero a la caja equivocada.
 */
export function resolveSaleSession<T extends OpenSession>(
  openSessions: T[],
  preferredRegisterIds: (string | null | undefined)[],
): T | undefined {
  for (const id of preferredRegisterIds) {
    const session = openSessions.find((item) => item.cashRegisterId === id);
    if (id && session) return session;
  }
  return openSessions.length === 1 ? openSessions[0] : undefined;
}

/** Sesión sugerida en formularios que tienen su propio selector de caja. */
export function preferredCashSessionId(
  openSessions: OpenSession[],
  organizationId: string,
  branchId: string,
  storage?: Pick<Storage, "getItem">,
): string {
  return (
    resolveSaleSession(openSessions, [
      readCashRegisterChoice(organizationId, branchId, storage),
    ])?.id ?? ""
  );
}

export function cashSessionLabel(
  session: OpenSession & { openedAt: string },
  registers: Register[],
): string {
  const name =
    registers.find((register) => register.id === session.cashRegisterId)
      ?.name ?? "Caja";
  return `${name} · ${new Date(session.openedAt).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}
