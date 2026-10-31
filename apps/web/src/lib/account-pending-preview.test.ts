import { expect, it } from "vitest";
import { accountPendingPreview } from "./account-pending-preview";
it("reflects a final amount up and down without changing the persisted pending", () => {
  for (const draft of ["2000", "12000", "800"])
    expect(accountPendingPreview("967724", draft, true)).toBe(
      Number(draft) * 100,
    );
  expect(accountPendingPreview("967724", undefined, true)).toBe(967724);
  expect(accountPendingPreview("967724", "", true)).toBe(967724);
  expect(accountPendingPreview("967724", "invalid", true)).toBe(967724);
  expect(accountPendingPreview("967724", "2000", false)).toBe(967724);
});
