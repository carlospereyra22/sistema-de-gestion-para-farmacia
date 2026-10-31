import { useEffect, useRef, useState } from "react";

import { parseSaleQuantity, isQuantityScannerBurst } from "./lib/sale-quantity";
export function SaleQuantityInput({
  quantity,
  maximum,
  name,
  onCommit,
  onFinished,
  onScan,
  onInvalid,
}: {
  quantity: number;
  maximum: number;
  name: string;
  onCommit: (quantity: number) => void;
  onFinished?: () => void;
  onScan?: (code: string) => void;
  onInvalid: (message: string) => void;
}) {
  const [draft, setDraft] = useState(String(quantity));
  const burst = useRef({ text: "", start: 0, last: 0 });
  const skipBlur = useRef(false);
  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);
  function commit() {
    const next = parseSaleQuantity(draft, maximum);
    if (next === null) {
      onInvalid(`Indicá una cantidad entera entre 1 y ${maximum}.`);
      setDraft(String(quantity));
      return;
    }
    setDraft(String(next));
    if (next !== quantity) onCommit(next);
  }
  return (
    <span className="relative block min-w-0">
      <input
        aria-label={`Cantidad de ${name}`}
        title="Escribí la cantidad"
        inputMode="numeric"
        value={draft}
        onFocus={(event) => {
          burst.current = { text: "", start: 0, last: 0 };
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          commit();
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
              previous.text.length > 0 && now - previous.last < 80
                ? {
                    text: previous.text + event.key,
                    start: previous.start,
                    last: now,
                  }
                : { text: event.key, start: now, last: now };
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const scan = burst.current;
            if (onScan && isQuantityScannerBurst(scan, now)) {
              skipBlur.current = true;
              setDraft(String(quantity));
              event.currentTarget.blur();
              onScan(scan.text);
              onFinished?.();
              return;
            }
            event.currentTarget.blur();
            onFinished?.();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(quantity));
            skipBlur.current = true;
            event.currentTarget.blur();
            onFinished?.();
          }
        }}
        className="sale-quantity-value"
      />
    </span>
  );
}
