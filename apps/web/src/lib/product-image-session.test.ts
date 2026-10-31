import { describe, expect, it } from "vitest";
import {
  createProductImageCache,
  productImageKey,
} from "./product-image-cache";

describe("session-scoped product photos", () => {
  it("keeps the image key when the access token renews", () => {
    expect(productImageKey("old", "org", "product", "v1", true)).toBe(
      productImageKey("new", "org", "product", "v1", true),
    );
  });
  it("does not reuse images across login sessions, organizations or versions", async () => {
    const firstSession = createProductImageCache();
    const key = productImageKey("old", "org", "product", "v1", true);
    await firstSession.load(key, async () => "image");
    expect(createProductImageCache().peek(key)).toBeUndefined();
    expect(
      firstSession.peek(productImageKey("new", "other", "product", "v1", true)),
    ).toBeUndefined();
    expect(
      firstSession.peek(productImageKey("new", "org", "product", "v2", true)),
    ).toBeUndefined();
  });
});
