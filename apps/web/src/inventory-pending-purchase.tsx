import { useEffect, useState } from "react";
import { getPurchases, type Purchase } from "./lib/api";
import { purchasePending } from "./lib/purchases";
export function InventoryPendingPurchase({
  token,
  organizationId,
  branchId,
  productId,
  onOpen,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  productId: string;
  onOpen: (id: string) => void;
}) {
  const [matches, setMatches] = useState<{ scope: string; rows: Purchase[] }>();
  const scope = `${organizationId}:${branchId}:${productId}`;
  useEffect(() => {
    if (!productId) return;
    let active = true;
    void getPurchases(token, organizationId, branchId)
      .then((rows) => {
        if (active)
          setMatches({
            scope,
            rows: rows.filter(
              (p) =>
                ["ORDERED", "PARTIALLY_RECEIVED"].includes(p.status) &&
                p.items.some(
                  (i) => i.productId === productId && purchasePending(i) > 0,
                ),
            ),
          });
      })
      .catch(() => {
        if (active) setMatches({ scope, rows: [] });
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, branchId, productId, scope]);
  if (matches?.scope !== scope || !matches.rows.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p>
        Este producto tiene compras pendientes. Si llegó por uno de esos
        pedidos, recibilo desde la compra para conservar su saldo.
      </p>
      {matches.rows.map((p) => (
        <button
          key={p.id}
          type="button"
          className="mt-2 block font-medium text-teal-800 underline"
          onClick={() => onOpen(p.id)}
        >
          Recibir compra {p.reference || p.id.slice(0, 8).toUpperCase()} ·{" "}
          {p.supplierName}
        </button>
      ))}
    </div>
  );
}
