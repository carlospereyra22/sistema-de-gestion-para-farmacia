import type { Prisma } from "@prisma/client";

const MAX_LENGTH = 32;
const FALLBACK = "SUCURSAL";

function codeFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, "");
}

/**
 * El código es un identificador interno que nadie necesita elegir: se genera del nombre
 * y lleva un número si ya existe, porque la base no lo admite repetido en una farmacia.
 */
export function uniqueBranchCode(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const derived = codeFromName(name);
  const base = derived.length >= 2 ? derived : FALLBACK;
  if (!taken.has(base)) return base;
  for (let number = 2; ; number += 1) {
    const suffix = `-${number}`;
    const candidate = `${base.slice(0, MAX_LENGTH - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Las eliminadas también cuentan: la base no admite el código repetido. */
export async function generateBranchCode(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: string,
): Promise<string> {
  const existing = await tx.branch.findMany({
    where: { organizationId },
    select: { code: true },
  });
  return uniqueBranchCode(name, new Set(existing.map(({ code }) => code)));
}
