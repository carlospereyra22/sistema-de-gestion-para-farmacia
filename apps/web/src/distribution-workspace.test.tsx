import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DistributionWorkspace } from "./distribution-workspace";
import { distributionPrint } from "./lib/distribution-print";
import {
  distributionRequest,
  DistributionRejected,
  type DistributionDocument,
} from "./lib/api";
afterEach(() => vi.unstubAllGlobals());
it("renders a stock-only workflow without payment or price controls", () => {
  const html = renderToStaticMarkup(
    <DistributionWorkspace
      token="test"
      organizationId="org"
      branchId="branch"
      userKey="user"
      products={[]}
      stock={[]}
      done={vi.fn()}
    />,
  );
  expect(html).toContain("Salida por distribución");
  expect(html).toContain("Confirmar salida");
  expect(html).not.toContain("Borrador conservado");
  expect(html).not.toContain("Descartar borrador");
  expect(html).toContain("Historial</button>");
  expect(html).not.toContain("Últimas 100 salidas");
  expect(html).not.toContain("Actualizar historial</button>");
  expect(html).toContain("Sin ventas, caja ni cuenta corriente");
  expect(html).not.toContain("Precio unitario");
  expect(html).toContain("Confirmo los lotes y cantidades");
});
it("escapes external text in the internal dispatch printout", () => {
  const doc: DistributionDocument = {
    id: "id",
    destination: "<script>alert(1)</script>",
    reason: "Prueba",
    actorId: "actor",
    createdAt: "2026-10-05T12:00:00Z",
    reversedAt: null,
    reversalReason: null,
    items: [
      {
        lotId: "lot",
        productId: "p",
        productName: "<img src=x>",
        lotNumber: "123",
        expiresAt: null,
        quantity: 2,
      },
    ],
  };
  const html = distributionPrint(doc);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("No es factura ni recibo de pago");
});
it("distinguishes rejected input from uncertain server failures", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Sin stock" }), { status: 409 }),
    )
    .mockResolvedValueOnce(new Response("{}", { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    distributionRequest("token", "org", "branch"),
  ).rejects.toBeInstanceOf(DistributionRejected);
  try {
    await distributionRequest("token", "org", "branch");
  } catch (cause) {
    expect(cause).not.toBeInstanceOf(DistributionRejected);
  }
});
