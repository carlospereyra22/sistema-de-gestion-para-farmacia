import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, SUBSCRIPTION_RESTRICTED } from "./api-fetch";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const listen = () => {
    const target = new EventTarget();
    const heard = vi.fn();
    target.addEventListener(SUBSCRIPTION_RESTRICTED, heard);
    vi.stubGlobal("window", target);
    return heard;
  };

  it("avisa cuando la API corta por la suscripción", async () => {
    const heard = listen();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 402 })),
    );

    const response = await apiFetch("/x");

    expect(response.status).toBe(402);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("no avisa ante otras respuestas", async () => {
    const heard = listen();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 403 })),
    );

    await apiFetch("/x");

    expect(heard).not.toHaveBeenCalled();
  });

  it("pasa la llamada tal cual", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const init = { method: "POST", body: "{}" };

    await apiFetch("/x", init);

    expect(fetch).toHaveBeenCalledWith("/x", init);
  });
});
