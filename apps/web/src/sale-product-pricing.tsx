import { useEffect, useRef, useState, type ComponentProps } from "react";
import { SaleUnitPriceInput } from "./sale-unit-price-input";
import {
  discountedUnitPrice,
  productDiscountDraft,
  type ProductDiscountMode,
} from "./lib/product-discount";
import { isQuantityScannerBurst } from "./lib/sale-quantity";

export function SaleProductPricing(
  props: ComponentProps<typeof SaleUnitPriceInput>,
) {
  const { maximum, price, name, disabled, onCommit, onInvalid } = props;
  const [mode, setMode] = useState<ProductDiscountMode>("percent");
  const [draft, setDraft] = useState(
    productDiscountDraft(maximum, price, mode),
  );
  const dirty = useRef(false);
  const burst = useRef({ text: "", start: 0, last: 0 });
  useEffect(() => {
    setDraft(productDiscountDraft(maximum, price, mode));
    dirty.current = false;
  }, [maximum, price, mode]);
  const commit = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const next = discountedUnitPrice(maximum, draft, mode);
    if (next === undefined)
      onInvalid(
        mode === "percent"
          ? "Indicá un descuento entre 0 y 100 %."
          : "El descuento por unidad no puede superar el precio original.",
      );
    if (next === undefined || !onCommit(next))
      setDraft(productDiscountDraft(maximum, price, mode));
  };
  return (
    <>
      <div className="min-w-0 text-center">
        {price < maximum && (
          <p className="text-[10px] leading-4 text-slate-400 line-through">
            ${" "}
            {(maximum / 100).toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        )}
        <SaleUnitPriceInput {...props} />
      </div>
      <div
        className={`sale-product-discount ${price < maximum ? "is-active" : ""}`}
        title="Descuento por unidad sobre el precio original"
      >
        <input
          aria-label={`Descuento por unidad de ${name}`}
          inputMode="decimal"
          placeholder="0"
          disabled={disabled}
          value={draft}
          onFocus={(e) => {
            e.currentTarget.select();
            burst.current = { text: "", start: 0, last: 0 };
          }}
          onChange={(e) => {
            dirty.current = true;
            setDraft(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            const now = e.timeStamp;
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
              const prev = burst.current;
              burst.current =
                prev.text.length && now - prev.last < 80
                  ? { text: prev.text + e.key, start: prev.start, last: now }
                  : { text: e.key, start: now, last: now };
            }
            if (e.key === "Escape") {
              e.preventDefault();
              dirty.current = false;
              setDraft(productDiscountDraft(maximum, price, mode));
              e.currentTarget.blur();
              props.onFinished();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (isQuantityScannerBurst(burst.current, now)) {
                dirty.current = false;
                setDraft(productDiscountDraft(maximum, price, mode));
                e.currentTarget.blur();
                props.onScan(burst.current.text);
              } else e.currentTarget.blur();
              props.onFinished();
            }
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={`Descuento de ${name}: ${mode === "percent" ? "porcentaje; cambiar a pesos" : "pesos por unidad; cambiar a porcentaje"}`}
          onClick={() => setMode(mode === "percent" ? "amount" : "percent")}
        >
          {mode === "percent" ? "%" : "$"}
          <span aria-hidden="true" className="text-[9px] text-slate-400">
            ▾
          </span>
        </button>
      </div>
    </>
  );
}
