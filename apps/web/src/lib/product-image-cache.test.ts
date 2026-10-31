import { describe, expect, it, vi } from "vitest";
import { createProductImageCache } from "./product-image-cache";

describe("product image memory cache", () => {
  it("reuses the decoded image immediately across views and shares pending requests", async () => {
    const cache = createProductImageCache();
    const fetchImage = vi.fn(async () => "image");
    const first = cache.load("session/org/product/v1", fetchImage);
    const second = cache.load("session/org/product/v1", fetchImage);
    expect(first).toBe(second);
    await first;
    expect(cache.peek("session/org/product/v1")).toBe("image");
    await cache.load("session/org/product/v1", fetchImage);
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });
  it("isolates versions, organizations and sessions", async () => {
    const cache = createProductImageCache();
    await cache.load("session/org/product/v1", async () => "old");
    for (const key of [
      "session/org/product/v2",
      "session/other/product/v1",
      "other/org/product/v1",
    ])
      expect(cache.peek(key)).toBeUndefined();
  });
  it("allows retry after failure and bounds memory", async () => {
    const cache = createProductImageCache(1);
    await expect(
      cache.load("one", async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    await cache.load("one", async () => "one");
    await cache.load("two", async () => "two");
    expect(cache.peek("one")).toBeUndefined();
    expect(cache.peek("two")).toBe("two");
  });
});
