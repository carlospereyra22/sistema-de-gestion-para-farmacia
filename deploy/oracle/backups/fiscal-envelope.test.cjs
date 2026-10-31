const { test } = require("node:test");
const assert = require("node:assert/strict");
const { seal, open } = require("./fiscal-envelope.cjs");
const password = "fixture-password-only-not-a-real-secret";
test("portable encrypted backup authenticates and preserves every binary byte", () => {
  const plain = Buffer.from(Array.from({ length: 4096 }, (_, n) => n % 256));
  const encrypted = seal(plain, password);
  assert.deepEqual(open(encrypted, password), plain);
  assert.notDeepEqual(seal(plain, password), encrypted);
  assert.throws(() => open(encrypted, password + "wrong"));
});
test("rejects corrupted header, payload, truncated tags and weak passwords", () => {
  const good = JSON.parse(seal(Buffer.from("fixture"), password));
  for (const patch of [
    { v: 2 },
    { nonce: "" },
    { tag: "AA==" },
    { payload: "AAAA" },
    { salt: "invalid!" },
  ])
    assert.throws(() =>
      open(Buffer.from(JSON.stringify({ ...good, ...patch })), password),
    );
  assert.throws(() => seal(Buffer.from("fixture"), "short"));
});
