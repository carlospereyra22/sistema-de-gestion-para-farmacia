import type { WorkspaceAlert } from "./workspace-alerts";

// Store only a fingerprint, not customer names or balances, in browser storage.
export function alertVersion(alert: WorkspaceAlert): string {
  let hash = 14695981039346656037n;
  for (const character of `${alert.title}\n${alert.detail}`) {
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(character.codePointAt(0)!)) * 1099511628211n,
    );
  }
  return `${alert.id}:${hash.toString(16)}`;
}
export function readSeenAlerts(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
