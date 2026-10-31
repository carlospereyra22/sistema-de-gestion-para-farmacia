import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("returns to the refreshed list after payment without opening another dialog", () => {
  const source = readFileSync(
    new URL("./workspace.tsx", import.meta.url),
    "utf8",
  );
  const editor = source.split("<PaymentEditor")[1]?.split("/>")[0];
  expect(editor).toBeDefined();
  const saved = editor?.split("onSaved={() => {")[1];
  expect(saved).toContain("setPaying(undefined)");
  expect(saved).toContain("setRevision((r) => r + 1)");
  expect(saved).toContain('setNotice("Pago registrado.');
  expect(saved).not.toContain("openDetail(");
  expect(saved).not.toContain("setDetail(");
});
