import { afterEach, expect, it, vi } from "vitest";
import {
  isFullscreen,
  subscribeFullscreen,
  toggleFullscreen,
} from "./fullscreen";

afterEach(() => vi.unstubAllGlobals());
function fixture(active = false, enabled = true) {
  return {
    fullscreenElement: active ? ({} as Element) : null,
    fullscreenEnabled: enabled,
    documentElement: {
      requestFullscreen: vi.fn().mockResolvedValue(undefined),
    },
    exitFullscreen: vi.fn().mockResolvedValue(undefined),
  };
}
it("requests the entire document immediately, preserving the click's user activation", async () => {
  const doc = fixture();
  const pending = toggleFullscreen(doc);
  expect(doc.documentElement.requestFullscreen).toHaveBeenCalledOnce();
  await pending;
  expect(doc.exitFullscreen).not.toHaveBeenCalled();
});
it("exits an active fullscreen document without requesting fullscreen again", async () => {
  const doc = fixture(true);
  await toggleFullscreen(doc);
  expect(doc.exitFullscreen).toHaveBeenCalledOnce();
  expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
});
it("reports unsupported or policy-blocked fullscreen without attempting entry", async () => {
  const doc = fixture(false, false);
  await expect(toggleFullscreen(doc)).rejects.toThrow(
    "Este navegador no permite",
  );
  expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
});
it("propagates browser rejections instead of pretending fullscreen is active", async () => {
  const doc = fixture();
  doc.documentElement.requestFullscreen.mockRejectedValue(
    new TypeError("Denied"),
  );
  await expect(toggleFullscreen(doc)).rejects.toThrow("Denied");
  expect(doc.fullscreenElement).toBeNull();
});
it("observes entry and external exit events and removes its listener", () => {
  const doc = Object.assign(new EventTarget(), {
    fullscreenElement: null as Element | null,
  });
  vi.stubGlobal("document", doc);
  const states: boolean[] = [];
  const unsubscribe = subscribeFullscreen(() => states.push(isFullscreen()));
  expect(isFullscreen()).toBe(false);
  doc.fullscreenElement = {} as Element;
  doc.dispatchEvent(new Event("fullscreenchange"));
  doc.fullscreenElement = null;
  doc.dispatchEvent(new Event("fullscreenchange"));
  expect(states).toEqual([true, false]);
  unsubscribe();
  doc.dispatchEvent(new Event("fullscreenchange"));
  expect(states).toHaveLength(2);
});
it("is safe when rendered outside the browser", () => {
  expect(isFullscreen()).toBe(false);
});
