import { describe, expect, it } from "vitest";
import type { CurrentUserProfile } from "./api";
import { datosDelPerfil, msHastaVencer } from "./soporte";

describe("sesión de soporte", () => {
  it("arma los datos de la app con el perfil del usuario, como si entrara él", () => {
    const perfil = {
      email: "ana@farmacia.com",
      organizations: [
        {
          organizationId: "o1",
          displayName: "Ana",
          organization: { name: "Farmacia Centro", ticketHeader: null },
          roles: [
            {
              role: {
                permissions: [
                  { permission: { code: "SALE_READ" } },
                  { permission: { code: "SALE_MANAGE" } },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as CurrentUserProfile;
    expect(datosDelPerfil(perfil)).toEqual({
      email: "ana@farmacia.com",
      organizationId: "o1",
      displayName: "Ana",
      organizationName: "Farmacia Centro",
      permissionCodes: ["SALE_READ", "SALE_MANAGE"],
    });
  });

  it("calcula cuánto falta para que venza, sin pasar a negativo", () => {
    const ahora = Date.parse("2026-11-11T10:00:00.000Z");
    expect(msHastaVencer("2026-11-11T14:00:00.000Z", ahora)).toBe(4 * 3600_000);
    expect(msHastaVencer("2026-11-11T09:00:00.000Z", ahora)).toBe(0);
  });
});
