import { expect, it, vi } from "vitest";
import {
  addAlertHistory,
  readAlertHistory,
  recentAlertHistory,
} from "./alert-history";
import type { WorkspaceAlert } from "./workspace-alerts";
const alert: WorkspaceAlert = {
  id: "a",
  title: "Stock bajo",
  detail: "5 unidades",
  category: "stock",
  urgent: false,
};
const now = 1800000000000;
it("keeps the latest six seen versions and preserves their snapshots", () => {
  let entries = addAlertHistory([], [{ ...alert, detail: "0 unidades" }], now);
  for (let i = 1; i < 8; i++)
    entries = addAlertHistory(
      entries,
      [{ ...alert, detail: `${i} unidades` }],
      now + i,
    );
  expect(entries).toHaveLength(6);
  expect(entries[0].detail).toBe("7 unidades");
  expect(entries[5].detail).toBe("2 unidades");
});
it("expires exactly after seven days without resetting retention on duplicate reads", () => {
  const entries = addAlertHistory([], [alert], now);
  expect(addAlertHistory(entries, [alert], now + 100)[0].seenAt).toBe(now);
  expect(recentAlertHistory(entries, now + 7 * 86400000 - 1)).toHaveLength(1);
  expect(recentAlertHistory(entries, now + 7 * 86400000)).toEqual([]);
});
it("reads only the requested scoped key and tolerates invalid storage", () => {
  const getItem = vi
    .fn()
    .mockReturnValue(JSON.stringify(addAlertHistory([], [alert], now)));
  vi.stubGlobal("localStorage", { getItem });
  try {
    expect(readAlertHistory("user:org:branch", now)).toHaveLength(1);
    expect(getItem).toHaveBeenCalledWith("user:org:branch");
    getItem.mockReturnValue('[null, {}, {"seenAt":"bad"}]');
    expect(readAlertHistory("other", now)).toEqual([]);
    getItem.mockImplementation(() => {
      throw new Error("disabled");
    });
    expect(readAlertHistory("other", now)).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});
