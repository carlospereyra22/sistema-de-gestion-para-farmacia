import { expect, it } from "vitest";
import {
  conceptDescription,
  conceptStorageKey,
  readConceptDescriptions,
  saveConceptDescription,
} from "./saved-sale-concepts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
it("persists descriptions only and reuses them without duplicate casing or spaces", () => {
  const store = storage();
  const key = conceptStorageKey("org", "user");
  saveConceptDescription(store, key, " Pastilla suelta ");
  saveConceptDescription(store, key, "pastilla suelta");
  expect(readConceptDescriptions(store, key)).toEqual(["Pastilla suelta"]);
  expect(JSON.parse(store.getItem(key)!)).toEqual(["Pastilla suelta"]);
});
it("isolates saved descriptions by organization and user", () => {
  const store = storage();
  saveConceptDescription(store, conceptStorageKey("org", "user"), "Pastilla");
  expect(
    readConceptDescriptions(store, conceptStorageKey("other", "user")),
  ).toEqual([]);
  expect(
    readConceptDescriptions(store, conceptStorageKey("org", "other")),
  ).toEqual([]);
});
it("rejects invalid descriptions and preserves malformed storage for recovery", () => {
  for (const value of ["ab", "a".repeat(161), "Pas\ntilla"])
    expect(conceptDescription(value)).toBeUndefined();
  const store = storage();
  store.setItem("key", "broken");
  expect(() => saveConceptDescription(store, "key", "Pastilla")).toThrow();
  expect(store.getItem("key")).toBe("broken");
});
it("reports storage failures rather than claiming a description was saved", () => {
  const store = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage unavailable");
    },
  };
  expect(() => saveConceptDescription(store, "key", "Pastilla")).toThrow(
    "Storage unavailable",
  );
});
