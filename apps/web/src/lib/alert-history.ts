import { alertVersion } from "./seen-alerts";
import type { WorkspaceAlert } from "./workspace-alerts";

export type AlertHistoryEntry = WorkspaceAlert & {
  version: string;
  seenAt: number;
};
const WEEK = 7 * 24 * 60 * 60 * 1000;
export function recentAlertHistory(
  entries: AlertHistoryEntry[],
  now = Date.now(),
) {
  const versions = new Set<string>();
  return entries
    .filter(
      (entry) =>
        Number.isFinite(entry.seenAt) &&
        entry.seenAt <= now &&
        now - entry.seenAt < WEEK,
    )
    .sort((a, b) => b.seenAt - a.seenAt)
    .filter((entry) => {
      if (versions.has(entry.version)) return false;
      versions.add(entry.version);
      return true;
    })
    .slice(0, 6);
}
export function addAlertHistory(
  entries: AlertHistoryEntry[],
  alerts: WorkspaceAlert[],
  now = Date.now(),
) {
  const existing = new Set(entries.map((entry) => entry.version));
  return recentAlertHistory(
    [
      ...alerts
        .filter((alert) => !existing.has(alertVersion(alert)))
        .map((alert) => ({
          ...alert,
          version: alertVersion(alert),
          seenAt: now,
        })),
      ...entries,
    ],
    now,
  );
}
export function readAlertHistory(
  key: string,
  now = Date.now(),
): AlertHistoryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return recentAlertHistory(
      value.filter((entry): entry is AlertHistoryEntry => {
        if (!entry || typeof entry !== "object") return false;
        const item = entry as Record<string, unknown>;
        return (
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.detail === "string" &&
          typeof item.version === "string" &&
          typeof item.seenAt === "number" &&
          typeof item.urgent === "boolean" &&
          (item.category === "accounts" || item.category === "stock")
        );
      }),
      now,
    );
  } catch {
    return [];
  }
}
