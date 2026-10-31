import { afterEach, expect, it, vi } from "vitest";
import { scheduleToastDismiss } from "./toast-auto-dismiss";
afterEach(() => vi.useRealTimers());
it.each([
  ["error", 6000],
  ["success", 3000],
] as const)("dismisses %s automatically", (variant, delay) => {
  vi.useFakeTimers();
  const close = vi.fn();
  scheduleToastDismiss(close, variant, false);
  vi.advanceTimersByTime(delay - 1);
  expect(close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(close).toHaveBeenCalledTimes(1);
});
it("pauses for hover/focus and cancels obsolete timers", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  expect(scheduleToastDismiss(close, "error", true)).toBeUndefined();
  const cancel = scheduleToastDismiss(close, "error", false);
  cancel?.();
  vi.advanceTimersByTime(10000);
  expect(close).not.toHaveBeenCalled();
  scheduleToastDismiss(close, "error", false);
  vi.advanceTimersByTime(6000);
  expect(close).toHaveBeenCalledTimes(1);
});
