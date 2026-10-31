const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveApiEntry } = require("./api-entry.cjs");
test("resolves both supported compiler output layouts", () => {
  for (const relative of [
    "apps/api/dist/main.js",
    "apps/api/dist/src/main.js",
  ]) {
    const expected = path.join("release", relative);
    assert.equal(
      resolveApiEntry("release", (file) => file === expected),
      expected,
    );
  }
});
test("rejects missing or ambiguous builds", () => {
  assert.throws(() => resolveApiEntry("release", () => false));
  assert.throws(() => resolveApiEntry("release", () => true));
});
