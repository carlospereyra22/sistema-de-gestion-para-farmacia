import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// UTF-8 bytes mistakenly decoded as Latin-1/Windows-1252.
const corruptText =
  /\uFFFD|\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\u00E2(?:\u0080|\u20AC)|\u00F0\u0178/;
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(tsx?|css|html|md)$/.test(entry.name)
        ? [path]
        : [];
  });
}

describe("source text encoding", () => {
  it("detects corrupt accents while accepting Spanish text", () => {
    expect(corruptText.test("autom\u00C3\u00A1tico")).toBe(true);
    expect(
      corruptText.test("Automático · revisión · período · ¿Contraseña? — $"),
    ).toBe(false);
  });
  it("keeps frontend, backend, contracts and documentation valid UTF-8 without mojibake", () => {
    const root = fileURLToPath(new URL("../../../../", import.meta.url));
    const paths = ["web/src", "api/src"].flatMap((path) =>
      sourceFiles(join(root, "apps", path)),
    );
    paths.push(
      ...sourceFiles(join(root, "packages/contracts/src")),
      ...sourceFiles(join(root, "docs")),
      join(root, "apps/web/index.html"),
    );
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (const path of paths) {
      const text = decoder.decode(readFileSync(path));
      expect(text, path).not.toMatch(corruptText);
    }
  });
});
