import { expect, it } from "vitest";
import { logoPreview, prepareTicketLogo } from "./ticket-logo";
it("renders the exact monochrome raster and keeps the legacy logo as fallback", () => {
  expect(logoPreview()).toBe("/logo-remito.png");
  expect(logoPreview("invalid")).toBe("/logo-remito.png");
  expect(decodeURIComponent(logoPreview("80" + "00".repeat(2047)))).toContain(
    '<rect x="0" y="0" width="1" height="1"/>',
  );
});
it("rejects unsupported files before decoding", async () => {
  await expect(
    prepareTicketLogo(new File(["test"], "x.svg", { type: "image/svg+xml" })),
  ).rejects.toThrow("PNG");
});
