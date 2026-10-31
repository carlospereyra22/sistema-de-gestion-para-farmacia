import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("starts movements as income and restores income only after a successful save", () => {
  const source = readFileSync(
    new URL("./workspace-shell.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain('useState<"IN" | "OUT">("IN")');
  const save = source.slice(
    source.indexOf("await createCashMovement("),
    source.indexOf('"No se pudo registrar el movimiento de caja."'),
  );
  expect(save).toMatch(
    /movementRequest.current = null;\s+setMovementType\("IN"\);/,
  );
  expect(save.indexOf('setMovementType("IN")')).toBeLessThan(
    save.indexOf("catch (cause)"),
  );
});
