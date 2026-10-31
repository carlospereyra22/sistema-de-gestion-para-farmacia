import { expect, it, vi } from "vitest";
import { InstallController } from "./pwa-install";

function setup(
  standalone = false,
  outcome: "accepted" | "dismissed" = "accepted",
) {
  const target = new EventTarget();
  const controller = new InstallController();
  const dispose = controller.start(target, () => standalone);
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome, platform: "web" }),
    },
  );
  return { target, controller, event, dispose };
}

it.each(["accepted", "dismissed"] as const)(
  "consumes a native %s prompt only once without navigating or reloading",
  async (outcome) => {
    const { target, controller, event, dispose } = setup(false, outcome);
    expect(controller.getSnapshot()).toBe(false);
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(controller.getSnapshot()).toBe(true);
    const result = controller.install();
    expect(controller.getSnapshot()).toBe(false);
    expect(await controller.install()).toBeNull();
    expect(await result).toBe(outcome);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    dispose();
  },
);

it("does not offer installation in an app window or after the native installation event", () => {
  const installed = setup(true);
  installed.target.dispatchEvent(installed.event);
  expect(installed.controller.getSnapshot()).toBe(false);
  installed.dispose();
  const pending = setup();
  pending.target.dispatchEvent(pending.event);
  pending.target.dispatchEvent(new Event("appinstalled"));
  expect(pending.controller.getSnapshot()).toBe(false);
  pending.dispose();
});

it("rejects a failed prompt and can receive a new browser offer", async () => {
  const { target, controller, event, dispose } = setup();
  event.prompt.mockRejectedValueOnce(new Error("Native prompt unavailable"));
  target.dispatchEvent(event);
  await expect(controller.install()).rejects.toThrow("unavailable");
  expect(controller.getSnapshot()).toBe(false);
  target.dispatchEvent(event);
  expect(await controller.install()).toBe("accepted");
  dispose();
});
