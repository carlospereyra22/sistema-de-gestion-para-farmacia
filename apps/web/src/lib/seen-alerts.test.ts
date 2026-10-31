import { expect, it, vi } from "vitest";
import { alertVersion, readSeenAlerts } from "./seen-alerts";
import type { WorkspaceAlert } from "./workspace-alerts";
const alert: WorkspaceAlert = {
  id: "stock:one",
  title: "Producto",
  detail: "3 unidades",
  category: "stock",
  urgent: false,
};
it("recognizes a seen alert while allowing changed content to notify again", () => {
  expect(alertVersion({ ...alert })).toBe(alertVersion(alert));
  expect(alertVersion({ ...alert, detail: "2 unidades" })).not.toBe(
    alertVersion(alert),
  );
  expect(alertVersion(alert)).not.toContain("Producto");
});
it("reads only the scoped storage and tolerates missing or malformed storage", () => {
  const getItem = vi
    .fn()
    .mockReturnValue(JSON.stringify([alertVersion(alert), 12]));
  vi.stubGlobal("localStorage", { getItem });
  try {
    expect(readSeenAlerts("user:org:branch")).toEqual([alertVersion(alert)]);
    expect(getItem).toHaveBeenCalledWith("user:org:branch");
    getItem.mockReturnValue("invalid");
    expect(readSeenAlerts("other")).toEqual([]);
    getItem.mockImplementation(() => {
      throw new Error("Unavailable");
    });
    expect(readSeenAlerts("other")).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});
