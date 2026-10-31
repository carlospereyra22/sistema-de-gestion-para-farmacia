import { describe, expect, it, vi } from "vitest";
import { applyOrganizationFavicon } from "./organization-favicon";

function fixture(existing: boolean) {
  const attrs = new Map<string, string>([
    ["href", "/original.png"],
    ["type", "image/png"],
  ]);
  const icon = {
    rel: "icon",
    get href() {
      return attrs.get("href") ?? "";
    },
    set href(value: string) {
      attrs.set("href", value);
    },
    get type() {
      return attrs.get("type") ?? "";
    },
    set type(value: string) {
      attrs.set("type", value);
    },
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    removeAttribute: (name: string) => attrs.delete(name),
    remove: vi.fn(),
  };
  const page = {
    querySelector: vi.fn(() => (existing ? icon : null)),
    createElement: vi.fn(() => icon),
    head: { appendChild: vi.fn() },
  };
  return { icon, page, document: page as unknown as Document };
}
describe("organization favicon", () => {
  it("updates the existing icon and restores it on logout or scope change", () => {
    const { icon, document, page } = fixture(true);
    const cleanup = applyOrganizationFavicon(
      "data:image/svg+xml,logo",
      document,
    );
    expect(icon.href).toBe("data:image/svg+xml,logo");
    expect(icon.type).toBe("image/svg+xml");
    expect(page.head.appendChild).not.toHaveBeenCalled();
    cleanup();
    expect(icon.href).toBe("/original.png");
    expect(icon.type).toBe("image/png");
  });
  it("creates an icon only when needed and removes it on cleanup", () => {
    const { icon, document, page } = fixture(false);
    const cleanup = applyOrganizationFavicon("/logo-remito.png", document);
    expect(page.head.appendChild).toHaveBeenCalledWith(icon);
    expect(icon.type).toBe("image/png");
    cleanup();
    expect(icon.remove).toHaveBeenCalledOnce();
  });
});
