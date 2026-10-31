export function DiscountAmountInput({
  value,
  onChange,
  onApply,
  onCancel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
  className: string;
}) {
  return (
    <input
      aria-label="Importe del descuento"
      className={className}
      type="text"
      inputMode="decimal"
      autoFocus
      value={value}
      placeholder="0"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onApply();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    />
  );
}
