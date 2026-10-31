import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("shares visible thin scrollbars across the workspace, including checkout", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  expect(css).toMatch(/\*\s*\{\s*scrollbar-width: thin;/);
  expect(css).toContain("scrollbar-color: #94b8b2 #f1f7f6");
  expect(css).toMatch(
    /\*::-webkit-scrollbar\s*\{\s*width: 6px;\s*height: 6px;/,
  );
  expect(css).toMatch(
    /\.workspace-layout\[data-sidebar\] > \.workspace-navigation\s*\{[^}]*overflow-y: auto;[^}]*scrollbar-width: none;/,
  );
  expect(css).toContain(
    ".workspace-layout[data-sidebar] > .workspace-navigation::-webkit-scrollbar",
  );
  expect(css).not.toMatch(/\*::-webkit-scrollbar\s*\{\s*display: none/);
  expect(css).toContain("forced-colors: active");
});
