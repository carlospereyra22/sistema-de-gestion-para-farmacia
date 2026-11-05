import type { RefObject } from "react";
import { InventorySearchSelect } from "./inventory-search-select";
import type { StockLot } from "./lib/api";
import {
  inventoryLotChoice,
  type InventoryOption,
} from "./lib/inventory-search";
import { visibleProductLots } from "./lib/product-lots";

// Producto y lote por separado: productos homónimos o con varios lotes se
// distinguen eligiendo primero el producto y después uno de sus lotes.
export function InventoryLotPicker({
  stock,
  productOptions,
  productId,
  lotId,
  onProductChange,
  onLotChange,
  lotInputRef,
}: {
  stock: StockLot[];
  // Sólo productos con unidades: los demás no tienen lote para elegir.
  productOptions: InventoryOption[];
  productId: string;
  lotId: string;
  onProductChange: (id: string) => void;
  onLotChange: (id: string) => void;
  lotInputRef: RefObject<HTMLInputElement | null>;
}) {
  const lots = visibleProductLots(stock, productId, "");
  return (
    <>
      <InventorySearchSelect
        label="Producto"
        value={productId}
        options={productOptions}
        onChange={(id) => {
          onProductChange(id);
          const next = visibleProductLots(stock, id, "");
          // Un único lote no es una decisión: queda elegido.
          if (next.length === 1) onLotChange(next[0]!.id);
          else if (id)
            window.requestAnimationFrame(() => lotInputRef.current?.focus());
        }}
      />
      <InventorySearchSelect
        label="Lote"
        value={lotId}
        options={lots.map(inventoryLotChoice)}
        inputRef={lotInputRef}
        disabled={!productId}
        placeholder={productId ? "Elegí un lote" : "Elegí primero el producto"}
        onChange={onLotChange}
      />
    </>
  );
}
