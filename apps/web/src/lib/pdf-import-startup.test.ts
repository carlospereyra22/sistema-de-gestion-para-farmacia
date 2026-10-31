import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("prepares lazy PDF dependencies before selecting a file to avoid a dev reload", () => {
  const config = readFileSync(
    new URL("../../vite.config.ts", import.meta.url),
    "utf8",
  );
  expect(config).toMatch(
    /optimizeDeps:\s*\{\s*include:\s*\["pdfjs-dist", "tesseract.js"\]/,
  );
});
