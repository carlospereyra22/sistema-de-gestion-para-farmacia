import { afterEach, expect, it, vi } from "vitest";
import { createSaleCostTooltipController } from "./sale-cost-tooltip";

afterEach(() => vi.useRealTimers());

it("dismisses after two seconds even while hovered, and can show again", () => {
  vi.useFakeTimers();
  const controller = createSaleCostTooltipController();
  const close = vi.fn();
  controller.show(close);
  vi.advanceTimersByTime(1999);
  expect(close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(close).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2000);
  expect(close).toHaveBeenCalledTimes(1);
  controller.show(close);
  vi.advanceTimersByTime(2000);
  expect(close).toHaveBeenCalledTimes(2);
});

it("replaces the previous row immediately and ignores stale cleanup", () => {
  vi.useFakeTimers();
  const controller = createSaleCostTooltipController();
  const first = vi.fn();
  const second = vi.fn();
  const releaseFirst = controller.show(first);
  vi.advanceTimersByTime(500);
  controller.show(second);
  expect(first).toHaveBeenCalledTimes(1);
  releaseFirst?.();
  vi.advanceTimersByTime(1500);
  expect(second).not.toHaveBeenCalled();
  vi.advanceTimersByTime(500);
  expect(second).toHaveBeenCalledTimes(1);
});

it("cancels pending dismissal on leave or unmount", () => {
  vi.useFakeTimers();
  const controller = createSaleCostTooltipController();
  const close = vi.fn();
  const release = controller.show(close);
  release?.();
  vi.advanceTimersByTime(10000);
  expect(close).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("opening the account menu dismisses an existing cost and blocks hover or focus until closing", () => {
  vi.useFakeTimers();
  const controller = createSaleCostTooltipController();
  const close = vi.fn();
  controller.show(close);
  const resume = controller.suspend();
  expect(close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(controller.show(vi.fn())).toBeUndefined();
  resume();
  expect(close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0); // Closing does not reopen old costs.
  expect(controller.show(close)).toBeTypeOf("function");
  vi.advanceTimersByTime(2000);
  expect(close).toHaveBeenCalledTimes(2);
});

it("independent menu lifecycles cannot release another active blocker", () => {
  const controller = createSaleCostTooltipController();
  const first = controller.suspend();
  const second = controller.suspend();
  first();
  first();
  expect(controller.show(vi.fn())).toBeUndefined();
  second();
  const release = controller.show(vi.fn());
  expect(release).toBeTypeOf("function");
  release?.();
});
