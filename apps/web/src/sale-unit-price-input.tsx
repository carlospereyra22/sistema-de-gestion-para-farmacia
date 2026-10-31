import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseDiscountDraft } from "./lib/discount-editor";
import { isQuantityScannerBurst } from "./lib/sale-quantity";
import { saleCostTooltipController } from "./lib/sale-cost-tooltip";

type CostLot = { id: string; number: string; unitCostMinor: string };

export function SaleUnitCostDetails({ costs }: { costs: CostLot[] }) {
  return (
    <>
      <strong>Costo</strong>
      {costs.length ? (
        costs.slice(0, 4).map((lot) => (
          <span className="sale-unit-price-cost" key={lot.id}>
            <span>Lote {lot.number}</span>
            <b>
              ${" "}
              {(Number(lot.unitCostMinor) / 100).toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </b>
          </span>
        ))
      ) : (
        <span>Sin costo disponible</span>
      )}
      {costs.length > 4 && (
        <small>Otros {costs.length - 4} lotes: consultá Inventario.</small>
      )}
    </>
  );
}

export function SaleUnitPriceInput({
  price,
  maximum,
  name,
  disabled,
  costs = [],
  onCommit,
  onInvalid,
  onFinished,
  onScan,
}: {
  price: number;
  maximum: number;
  name: string;
  disabled: boolean;
  costs?: CostLot[];
  onCommit: (price: number) => boolean;
  onInvalid: (message: string) => void;
  onFinished: () => void;
  onScan: (code: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const tooltipId = useId();
  const releaseTooltip = useRef<(() => void) | undefined>(undefined);
  const [tooltip, setTooltip] = useState<{ left: number; top: number } | null>(
    null,
  );
  const showCost = (element: HTMLElement) => {
    releaseTooltip.current?.();
    releaseTooltip.current = saleCostTooltipController.show(() =>
      setTooltip(null),
    );
    if (!releaseTooltip.current) {
      setTooltip(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setTooltip({
      left: Math.max(
        8,
        Math.min(rect.left + rect.width / 2 - 85, window.innerWidth - 178),
      ),
      top: Math.max(190, rect.top - 8),
    });
  };
  const hideCost = () => {
    releaseTooltip.current?.();
    setTooltip(null);
  };
  useEffect(() => {
    const hide = () => {
      releaseTooltip.current?.();
      setTooltip(null);
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      releaseTooltip.current?.();
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);
  const [draft, setDraft] = useState(
    (price / 100).toFixed(2).replace(".", ","),
  );
  const skipBlur = useRef(false);
  const burst = useRef({ text: "", start: 0, last: 0 });
  const formatted = (value: number) =>
    (value / 100).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  useEffect(() => {
    setDraft((price / 100).toFixed(2).replace(".", ","));
  }, [price]);
  return (
    <label
      className="sale-unit-price-field"
      onMouseEnter={(event) => showCost(event.currentTarget)}
      onMouseLeave={hideCost}
    >
      <span aria-hidden="true" className="sale-unit-price-display">
        $ {formatted(price)}
      </span>
      <input
        aria-label={`Precio unitario de ${name}`}
        aria-describedby={tooltip ? tooltipId : undefined}
        disabled={disabled}
        inputMode="decimal"
        value={editing ? draft : formatted(price)}
        onFocus={(event) => {
          showCost(event.currentTarget);
          setEditing(true);
          setDraft((price / 100).toFixed(2).replace(".", ","));
          burst.current = { text: "", start: 0, last: 0 };
          const input = event.currentTarget;
          window.requestAnimationFrame(() => {
            if (document.activeElement === input) input.select();
          });
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          hideCost();
          setEditing(false);
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          const next = draft.trim() ? parseDiscountDraft(draft) : undefined;
          if (next === undefined || next > maximum) {
            onInvalid(`Indicá un precio entre $ 0 y $ ${formatted(maximum)}.`);
          } else if (next !== price) onCommit(next);
          setDraft((price / 100).toFixed(2).replace(".", ","));
        }}
        onKeyDown={(event) => {
          const now = event.timeStamp;
          if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey
          ) {
            const previous = burst.current;
            burst.current =
              previous.text.length && now - previous.last < 80
                ? {
                    text: previous.text + event.key,
                    start: previous.start,
                    last: now,
                  }
                : { text: event.key, start: now, last: now };
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (isQuantityScannerBurst(burst.current, now)) {
              skipBlur.current = true;
              event.currentTarget.blur();
              onScan(burst.current.text);
            } else event.currentTarget.blur();
            onFinished();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            skipBlur.current = true;
            event.currentTarget.blur();
            onFinished();
          }
        }}
      />
      {tooltip &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="sale-unit-price-tooltip"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            <SaleUnitCostDetails costs={costs} />
          </div>,
          document.body,
        )}
    </label>
  );
}
