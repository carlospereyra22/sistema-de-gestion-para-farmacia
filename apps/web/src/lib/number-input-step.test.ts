import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("keeps numeric arrows free from fractional step sizes across the UI", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const inspect = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (entry.name.endsWith(".tsx")) {
        const source = readFileSync(path, "utf8");
        expect(source, path).not.toMatch(/\bstep\s*=\s*["'{]\s*0\.\d+/);
        expect(source, path).not.toMatch(/\bstep\s*=\s*\{[^}]*["']0\.\d+/);
      }
    }
  };
  inspect(root);
});
