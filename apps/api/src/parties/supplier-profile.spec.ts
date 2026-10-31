import { supplierProfile } from "./supplier-profile";

describe("supplier profile", () => {
  it("trims fields and clears optional values without inventing contacts", () => {
    expect(
      supplierProfile({
        name: " Ramona ",
        phone: " 381 444 ",
        email: " ",
        notes: " Martes ",
      }),
    ).toEqual({
      name: "Ramona",
      phone: "381 444",
      email: null,
      notes: "Martes",
    });
    expect(supplierProfile({})).toEqual({});
  });
  it.each([
    { name: " " },
    { email: "invalid" },
    { phone: "1".repeat(61) },
    { notes: "x".repeat(1001) },
  ])("rejects invalid profile %p", (input) => {
    expect(() => supplierProfile(input)).toThrow();
  });
});
