import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SaleCreditMenu } from "./sale-credit-actions";
import { SaleCreditNotes } from "./sale-credit-notes";
import { saleInvoice } from "./lib/api";

afterEach(() => vi.unstubAllGlobals());

it("keeps credit actions in a closed disclosure and does not emit on render", () => {
  const onSelect = vi.fn();
  const html = renderToStaticMarkup(
    <SaleCreditMenu eligible onSelect={onSelect} />,
  );
  expect(html).toContain('aria-label="Más acciones de la factura"');
  expect(html).toContain("Emitir nota de crédito");
  expect(html).toContain("Ver notas de crédito");
  expect(html).not.toMatch(/<details[^>]*\sopen=/);
  expect(html.match(/<button/g)).toHaveLength(2);
  expect(html).not.toContain('type="submit"');
  expect(onSelect).not.toHaveBeenCalled();
});

it("does not expose the menu when the invoice is not eligible", () => {
  expect(
    renderToStaticMarkup(
      <SaleCreditMenu eligible={false} onSelect={vi.fn()} />,
    ),
  ).toBe("");
});

it("opens notes in list mode without the issuance form and keeps create as the existing default", () => {
  const props = {
    token: "test",
    organizationId: "org",
    branchId: "branch",
    saleId: "sale",
  };
  const list = renderToStaticMarkup(
    <SaleCreditNotes {...props} initialMode="list" />,
  );
  expect(list).toContain("Preparar nueva nota de crédito");
  expect(list).not.toContain("Seleccioná sólo las cantidades");
  expect(list).not.toContain('type="submit"');
  const create = renderToStaticMarkup(<SaleCreditNotes {...props} />);
  expect(create).toContain("Seleccioná sólo las cantidades");
  expect(create).toContain("Ver notas existentes");
  expect(create).toContain("Consultando notas de crédito");
});

it("checks invoice eligibility through a read-only request, never the process endpoint", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ environment: "PRODUCTION", status: "AUTHORIZED" }),
        { status: 200 },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  await saleInvoice("token", "org", "branch", "sale");
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/sales\/sale\/invoice$/),
    expect.objectContaining({ method: "GET" }),
  );
});
