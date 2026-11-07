import { isOrganizationAdministrator } from "./administrator-role";

const withRoles = (...codes: string[]) =>
  codes.map((code) => ({ role: { code } }));

describe("isOrganizationAdministrator", () => {
  it.each(["OWNER", "ADMIN"])("reconoce el rol %s", (code) => {
    expect(isOrganizationAdministrator(withRoles(code))).toBe(true);
  });

  it("alcanza con que uno de los roles administre", () => {
    expect(isOrganizationAdministrator(withRoles("USER", "OWNER"))).toBe(true);
  });

  it.each([[["USER"]], [["CAJERO", "VENDEDOR"]], [[]]])(
    "rechaza %j",
    (codes) => {
      expect(isOrganizationAdministrator(withRoles(...codes))).toBe(false);
    },
  );
});
