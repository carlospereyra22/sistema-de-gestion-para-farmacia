import { useState } from "react";
import {
  joinPhone,
  otherPhoneDial,
  phoneCountries,
  phoneExample,
  phoneFromInput,
  phoneMaxLength,
  phoneWithDial,
  splitPhone,
} from "./lib/phone-number";
import { ProductFilterSelect } from "./product-filter-select";
import { field } from "./supplier-payables/dialog";

const options = [
  ...phoneCountries.map(({ dial, name }) => ({
    value: dial,
    label: `${name} ${dial}`,
  })),
  { value: otherPhoneDial, label: "Otro país" },
];

export function PhoneInput({
  label,
  value,
  maxLength = phoneMaxLength,
  onChange,
}: {
  label: string;
  value?: string | null;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  const [phone, setPhone] = useState(() => splitPhone(value));
  const update = (next: { dial: string; number: string }) => {
    setPhone(next);
    onChange(joinPhone(next.dial, next.number));
  };
  return (
    <div className="text-sm text-slate-500">
      <p className="mb-1">{label}</p>
      <div className="grid gap-2 md:grid-cols-[11rem_minmax(0,1fr)]">
        <ProductFilterSelect
          compact
          label="País del teléfono"
          value={phone.dial}
          icon={null}
          options={options}
          onChange={(dial) => update(phoneWithDial(phone.number, dial))}
        />
        <input
          aria-label="Número de teléfono"
          className={field}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={maxLength - (phone.dial ? phone.dial.length + 1 : 0)}
          placeholder={phoneExample(phone.dial)}
          value={phone.number}
          onChange={(e) => update(phoneFromInput(phone.dial, e.target.value))}
        />
      </div>
    </div>
  );
}
