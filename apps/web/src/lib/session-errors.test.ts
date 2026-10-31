import { afterEach, expect, it, vi } from "vitest";
import { refreshSession, SessionExpiredError } from "./api";
afterEach(() => vi.unstubAllGlobals());
it("only treats an explicit unauthorized renewal as an expired session", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  await expect(refreshSession()).rejects.toBeInstanceOf(SessionExpiredError);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await expect(refreshSession()).rejects.not.toBeInstanceOf(
    SessionExpiredError,
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Network error")),
  );
  await expect(refreshSession()).rejects.not.toBeInstanceOf(
    SessionExpiredError,
  );
});
