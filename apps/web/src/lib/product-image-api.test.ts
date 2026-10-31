import { afterEach, describe, expect, it, vi } from "vitest";
import { updateCatalogProductImage } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("product image updates", () => {
  it.each([null, "data:image/jpeg;base64,test"])(
    "sends only the image, without overwriting product fields (%s)",
    async (image) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      await updateCatalogProductImage("token", "org", "product", image);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "/organizations/org/catalog/products/product/details",
        ),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ imageDataUrl: image }),
        }),
      );
    },
  );
});
