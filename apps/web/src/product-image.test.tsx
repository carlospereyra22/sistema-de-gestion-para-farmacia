import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ImagePreview,
  ProductImageEditor,
  ProductImageDialog,
  ProductThumbnail,
  ProductFormImage,
} from "./product-image";
import { isOutsideDialog } from "./lib/dialog-bounds";
import { productImageCache, productImageKey } from "./lib/product-image-cache";

const props = { token: "test", organizationId: "org", name: "ACTRON" };
describe("manual product images", () => {
  it("offers inline upload and preserves a draft preview without a second dialog", () => {
    const render = (value: string | null | undefined) =>
      renderToStaticMarkup(
        <ProductFormImage
          {...props}
          value={value}
          onChange={() => undefined}
          onBusy={() => undefined}
          disabled={false}
        />,
      );
    expect(render(undefined)).toContain("Subir foto");
    expect(render(undefined)).toContain('type="file"');
    const preview = render("data:image/jpeg;base64,draft");
    expect(preview).toContain('src="data:image/jpeg;base64,draft"');
    expect(preview).toContain("Cambiar foto");
    expect(preview).toContain("Quitar");
    expect(preview).not.toContain("<dialog");
    expect(render(null)).not.toContain("<img");
  });
  it("renders compact suggestion photos without a nested button", async () => {
    const key = productImageKey("test", "org", "suggestion-photo", "v1", false);
    await productImageCache.load(
      key,
      async () => "data:image/jpeg;base64,test",
    );
    const html = renderToStaticMarkup(
      <ProductThumbnail
        {...props}
        productId="suggestion-photo"
        version="v1"
        preview={false}
      />,
    );
    expect(html).toContain("<img");
    expect(html).toContain('alt="ACTRON"');
    expect(html).toContain("size-9");
    expect(html).not.toContain("<button");
  });
  it("keeps a compact noninteractive fallback when a suggestion has no photo", () => {
    const html = renderToStaticMarkup(
      <ProductThumbnail {...props} productId="no-photo" preview={false} />,
    );
    expect(html).toContain("Sin foto");
    expect(html).toContain("size-9");
    expect(html).not.toContain("<button");
  });
  it("reserves the same preview height before and after the photo loads", () => {
    for (const src of [undefined, "data:image/jpeg;base64,test"]) {
      const html = renderToStaticMarkup(
        <ImagePreview src={src} name="Actron" onClose={() => undefined}>
          <button type="button">Guardar foto</button>
        </ImagePreview>,
      );
      expect(html).toContain("h-[min(45dvh,420px)]");
      expect(html).not.toContain("max-h-[45vh]");
    }
  });
  it("centers the photo title and keeps the close control accessible", () => {
    const html = renderToStaticMarkup(
      <ImagePreview
        src="data:image/jpeg;base64,test"
        name="Actron 400"
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("text-center");
    expect(html).toContain('aria-label="Cerrar foto"');
    expect(html).toContain("Actron 400");
  });
  it("distinguishes backdrop clicks from the image and dialog padding", () => {
    const bounds = { left: 100, top: 100, right: 500, bottom: 600 };
    expect(isOutsideDialog({ clientX: 50, clientY: 200 }, bounds)).toBe(true);
    expect(isOutsideDialog({ clientX: 550, clientY: 200 }, bounds)).toBe(true);
    expect(isOutsideDialog({ clientX: 200, clientY: 50 }, bounds)).toBe(true);
    expect(isOutsideDialog({ clientX: 200, clientY: 650 }, bounds)).toBe(true);
    expect(isOutsideDialog({ clientX: 200, clientY: 200 }, bounds)).toBe(false);
    expect(isOutsideDialog({ clientX: 100, clientY: 100 }, bounds)).toBe(false);
  });
  it("offers upload without automatic image lookup", () => {
    const html = renderToStaticMarkup(
      <ProductImageDialog
        name="ACTRON"
        hasExisting={false}
        immediate={true}
        onClose={() => undefined}
        onCommit={async () => undefined}
        onBusy={() => undefined}
      />,
    );
    expect(html).toContain("Subir foto");
    expect(html).toContain('type="file"');
    expect(html).toContain("image/jpeg,image/png,image/webp");
  });
  it("offers replacement, removal and undo for a pending image", () => {
    const html = renderToStaticMarkup(
      <ProductImageDialog
        name="ACTRON"
        hasExisting={true}
        immediate={false}
        initialValue="data:image/jpeg;base64,test"
        onClose={() => undefined}
        onCommit={async () => undefined}
        onBusy={() => undefined}
      />,
    );
    for (const label of [
      "Cambiar foto",
      "Quitar",
      "Deshacer",
      "La foto se guardará al guardar el producto.",
    ])
      expect(html).toContain(label);
  });
  it("keeps editing actions out of the product form until the photo is opened", () => {
    const html = renderToStaticMarkup(
      <ProductImageEditor
        {...props}
        value={undefined}
        onChange={() => undefined}
        onBusy={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Gestionar foto de ACTRON"');
    expect(html).not.toContain("Quitar foto");
    expect(html).not.toContain('type="file"');
  });
  it("does not request a nonexistent photo for a product without an image", () => {
    const html = renderToStaticMarkup(
      <ProductThumbnail {...props} productId="product" />,
    );
    expect(html).toContain("Sin foto");
    expect(html).not.toContain("<img");
  });
});
