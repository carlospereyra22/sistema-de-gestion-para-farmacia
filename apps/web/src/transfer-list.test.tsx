import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BranchListItem, CatalogProduct, Transfer } from "./lib/api";
import { TransferList } from "./transfer-list";

const branches = [
  { id: "source", name: "Casa Central", active: true },
  { id: "destination", name: "Prueba", active: true },
] as BranchListItem[];
const products = [
  { id: "product", name: "ACTRON 400 x20 RÁPIDA ACCIÓN" },
] as CatalogProduct[];
const transfer = {
  id: "transfer",
  status: "IN_TRANSIT",
  sourceBranchId: "source",
  destinationBranchId: "destination",
  createdAt: "2026-11-02T12:00:00.000Z",
  items: [{ id: "item", productId: "product", lotId: "lot", quantity: 1 }],
} as Transfer;

describe("TransferList", () => {
  it("muestra el producto compartido y permite recibir sólo en destino", () => {
    const destination = renderToStaticMarkup(
      <TransferList
        transfers={[transfer]}
        branchId="destination"
        branches={branches}
        products={products}
        busyId={null}
        onAdvance={() => undefined}
      />,
    );
    expect(destination).toContain("ACTRON 400 x20 RÁPIDA ACCIÓN");
    expect(destination).toContain("En tránsito");
    expect(destination).toContain("Recibir");

    const source = renderToStaticMarkup(
      <TransferList
        transfers={[transfer]}
        branchId="source"
        branches={branches}
        products={products}
        busyId={null}
        onAdvance={() => undefined}
      />,
    );
    expect(source).not.toContain(">Recibir</button>");
  });
});
