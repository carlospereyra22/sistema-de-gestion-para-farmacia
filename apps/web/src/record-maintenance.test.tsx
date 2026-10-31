import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClosureVisibility,
  LotMetadataEditor,
  RegisterManager,
} from "./record-maintenance";
import {
  archiveCashClosure,
  createCashRegister,
  editCashRegister,
  editLotMetadata,
  getCashClosures,
  type StockLot,
} from "./lib/api";

const scope = {
  token: "fixture",
  organizationId: "org",
  branchId: "branch",
  done: () => undefined,
};
const lot: StockLot = {
  id: "lot",
  productId: "product",
  productName: "Product",
  number: "ABC",
  expiresAt: "2027-12-31T00:00:00.000Z",
  metadataVersion: 3,
  quantity: 5,
  sellableQuantity: 5,
  expiredQuantity: 0,
  expiryStatus: "AVAILABLE",
  unitCostMinor: "100",
};

describe("record maintenance UI and scoped requests", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("offers a responsible name and sends its expected value on edits", async () => {
    const html = renderToStaticMarkup(
      <RegisterManager
        {...scope}
        registers={[
          {
            id: "a",
            name: "Central",
            active: true,
            responsibleName: "Ana Pérez",
          },
        ]}
      />,
    );
    expect(html).toContain("Responsable de caja (opcional)");
    expect(html).toContain("Ana Pérez");
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("{}", { status: 200 })),
      );
    vi.stubGlobal("fetch", fetchMock);
    await createCashRegister(
      scope.token,
      scope.organizationId,
      scope.branchId,
      "Nueva",
      undefined,
      "Ana Pérez",
    );
    await editCashRegister(
      scope.token,
      scope.organizationId,
      scope.branchId,
      { id: "a", name: "Central", active: true, responsibleName: "Ana Pérez" },
      "Central",
      true,
      null,
    );
    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({ name: "Nueva", responsibleName: "Ana Pérez" });
    expect(
      JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string),
    ).toMatchObject({
      responsibleName: null,
      expectedResponsibleName: "Ana Pérez",
    });
  });
  it("offers lot metadata correction without a quantity editor", () => {
    const html = renderToStaticMarkup(
      <LotMetadataEditor {...scope} lot={lot} />,
    );
    expect(html).toContain("Editar lote, vencimiento y costo");
    expect(html).toContain("Editar</button>");
    expect(html).not.toContain("underline");
    expect(html).toContain('type="button"');
    expect(html).not.toContain('type="number"');
  });
  it("distinguishes archive and restore actions", () => {
    expect(
      renderToStaticMarkup(
        <ClosureVisibility
          {...scope}
          id="id"
          label="Closure"
          archived={false}
        />,
      ),
    ).toContain("Eliminar</button>");
    expect(
      renderToStaticMarkup(
        <ClosureVisibility {...scope} id="id" label="Closure" archived />,
      ),
    ).toContain("Restaurar");
    const html = renderToStaticMarkup(
      <RegisterManager
        {...scope}
        registers={[
          { id: "a", name: "Central", active: true },
          { id: "b", name: "Old", active: false },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Configurar cajas"');
    expect(html).toContain("Eliminar</button>");
    expect(html).toContain("Restaurar</button>");
    expect(html).not.toContain("Editar / eliminar");
    expect(html).not.toContain("<section");
    expect(html).toContain("Se conservan sus cierres y movimientos");
    expect(html).toContain("Cajas configuradas");
    expect(html).toContain("Nueva caja");
    expect(html).toContain('aria-label="Buscar cajas"');
    expect(html).not.toContain("Información importante");
    expect(html).toContain("max-w-5xl");
    expect(html).toContain("h-[min(720px,85dvh)]");
    expect(html).toContain("open:flex-col");
    expect(html).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(html).toContain("[scrollbar-gutter:stable]");
  });
  it("creates a register in the active branch without opening a cash session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createCashRegister(
      scope.token,
      scope.organizationId,
      scope.branchId,
      "Mostrador 2",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/organizations/org/branches/branch/cash/registers");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body as string)).toEqual({ name: "Mostrador 2" });
  });
  it("sends only lot metadata with a concurrency version and reason", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await editLotMetadata(
      scope.token,
      scope.organizationId,
      scope.branchId,
      lot,
      "XYZ",
      null,
      "Checked package",
      "12345",
    );
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "/organizations/org/branches/branch/inventory/lots/lot",
    );
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body as string)).toEqual({
      number: "XYZ",
      expiresAt: null,
      reason: "Checked package",
      expectedVersion: 3,
      unitCostMinor: "12345",
    });
  });
  it("preserves the register's expected state to prevent stale overwrites", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await editCashRegister(
      scope.token,
      scope.organizationId,
      scope.branchId,
      { id: "register", name: "Central", active: true },
      "New",
      false,
    );
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/cash/registers/register");
    expect(JSON.parse(request.body as string)).toEqual({
      name: "New",
      active: false,
      expectedName: "Central",
      expectedActive: true,
    });
  });
  it("archives by PATCH with reason, never physical DELETE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await archiveCashClosure(
      scope.token,
      scope.organizationId,
      scope.branchId,
      "closure",
      true,
      "Duplicate view",
    );
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/cash/closures/closure");
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body as string)).toEqual({
      archived: true,
      reason: "Duplicate view",
    });
  });
  it("loads archived closures with explicit filter and propagates errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Sólo un administrador" }), {
          status: 403,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await getCashClosures(
      scope.token,
      scope.organizationId,
      scope.branchId,
      "2026-10-01",
      "2026-10-04",
      true,
    );
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("archived")).toBe("true");
    expect(url.searchParams.get("from")).toBe("2026-10-01");
    await expect(
      archiveCashClosure(
        scope.token,
        scope.organizationId,
        scope.branchId,
        "closure",
        true,
        "Reason",
      ),
    ).rejects.toThrow("Sólo un administrador");
  });
});
