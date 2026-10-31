const { test } = require("node:test");
const assert = require("node:assert/strict");
const { expiredNames } = require("./retention.cjs");
const { prune } = require("./retention.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("retains seven newest daily dates, never unrelated files", () => {
  const names = Array.from(
    { length: 10 },
    (_, i) => `gestion-2026-09-${String(i + 1).padStart(2, "0")}.dump`,
  );
  assert.deepEqual(
    expiredNames(
      [
        ...names,
        "notes.txt",
        "../gestion-2020-01-01.dump",
        "gestion-partial.dump",
      ],
      "daily",
    ),
    names.slice(0, 3).reverse(),
  );
});
test("retains four latest ISO weeks across years", () => {
  assert.deepEqual(
    expiredNames(
      [
        "gestion-2025-W50.dump",
        "gestion-2025-W51.dump",
        "gestion-2025-W52.dump",
        "gestion-2026-W01.dump",
        "gestion-2026-W02.dump",
      ],
      "weekly",
    ),
    ["gestion-2025-W50.dump"],
  );
});
test("does not remove any backup before retention is exceeded", () => {
  assert.deepEqual(expiredNames(["gestion-2026-09-11.dump"], "daily"), []);
});
test("prunes only expired managed files in a temporary fixture", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gestion-retention-test-"),
  );
  try {
    fs.mkdirSync(path.join(root, "daily"));
    fs.mkdirSync(path.join(root, "weekly"));
    for (let i = 1; i <= 8; i++)
      fs.writeFileSync(
        path.join(root, "daily", `gestion-2026-09-0${i}.dump`),
        "fixture",
      );
    fs.writeFileSync(path.join(root, "daily", "unrelated.dump"), "keep");
    prune(root);
    assert.equal(
      fs.existsSync(path.join(root, "daily", "gestion-2026-09-01.dump")),
      false,
    );
    assert.equal(
      fs.readFileSync(path.join(root, "daily", "unrelated.dump"), "utf8"),
      "keep",
    );
    assert.equal(fs.readdirSync(path.join(root, "daily")).length, 8);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
