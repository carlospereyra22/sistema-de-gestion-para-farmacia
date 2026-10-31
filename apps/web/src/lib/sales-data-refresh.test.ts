import { expect, it, vi } from "vitest";
import { subscribeSalesDataRefresh } from "./sales-data-refresh";

it("refreshes on entering Sales, window return and visible tab; unsubscribes on leaving", () => {
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const refresh = vi.fn();
  const stop = subscribeSalesDataRefresh(refresh, windowTarget, documentTarget);
  expect(refresh).toHaveBeenCalledTimes(1);
  windowTarget.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledTimes(2);
  documentTarget.visibilityState = "hidden";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
  documentTarget.visibilityState = "visible";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(3);
  stop();
  windowTarget.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledTimes(3);
  const again = subscribeSalesDataRefresh(
    refresh,
    windowTarget,
    documentTarget,
  );
  expect(refresh).toHaveBeenCalledTimes(4);
  again();
});
