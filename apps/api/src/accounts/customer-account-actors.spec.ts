import { customerAccountActors } from "./customer-account-actors";

const created = (actorId: string | null, entityId = "cliente") => ({
  entityId,
  actorId,
  action: "CUSTOMER_CREATED",
  before: null,
  after: null,
});
const configured = (actorId: string, before: boolean, after: boolean) => ({
  entityId: "cliente",
  actorId,
  action: "CREDIT_CONFIGURED",
  before: { enabled: before, limitMinor: "0" },
  after: { enabled: after, limitMinor: 0 },
});

describe("customerAccountActors", () => {
  it("distingue a quien creó el cliente de quien habilitó el crédito", () => {
    expect(
      customerAccountActors([
        created("ana"),
        configured("juan", false, true),
      ]).get("cliente"),
    ).toEqual({ createdById: "ana", creditEnabledById: "juan" });
  });
  it("no cambia quién habilitó al reconfigurar un crédito activo", () => {
    expect(
      customerAccountActors([
        configured("juan", false, true),
        configured("ana", true, true),
      ]).get("cliente")?.creditEnabledById,
    ).toBe("juan");
  });
  it("cuenta al último que habilitó después de deshabilitar", () => {
    const audits = [
      configured("juan", false, true),
      configured("ana", true, false),
    ];
    expect(
      customerAccountActors(audits).get("cliente")?.creditEnabledById,
    ).toBeNull();
    expect(
      customerAccountActors([...audits, configured("luz", false, true)]).get(
        "cliente",
      )?.creditEnabledById,
    ).toBe("luz");
  });
  it("no atribuye una configuración que deja el crédito apagado", () => {
    expect(
      customerAccountActors([configured("ana", false, false)]).get("cliente"),
    ).toEqual({ createdById: null, creditEnabledById: null });
  });
  it("separa los datos por cliente e ignora registros sin entidad", () => {
    const actors = customerAccountActors([
      created("ana", "uno"),
      created("juan", "dos"),
      { ...created("luz"), entityId: null },
    ]);
    expect(actors.get("uno")?.createdById).toBe("ana");
    expect(actors.get("dos")?.createdById).toBe("juan");
    expect(actors.size).toBe(2);
  });
});
