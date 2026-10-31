import type { MedicineReference } from "./lib/api";
import { ChevronDown } from "lucide-react";

const productReferenceSources = [
  { value: "official", label: "Padrón oficial" },
  { value: "alfabeta", label: "AlfaBeta" },
  { value: "preciosderemedios", label: "Remedios" },
] as const;

export function ProductReferenceSource({
  value,
  onChange,
}: {
  value: MedicineReference["source"];
  onChange: (source: MedicineReference["source"]) => void;
}) {
  return (
    <div className="relative w-[124px] shrink-0">
      <select
        aria-label="Fuente para vincular el medicamento"
        value={value}
        onChange={(event) => {
          const source = productReferenceSources.find(
            (item) => item.value === event.target.value,
          );
          if (source) onChange(source.value);
        }}
        className="h-10 w-full appearance-none rounded-md border border-slate-300 bg-white pl-2 pr-5 text-sm! text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      >
        {productReferenceSources.map((source) => (
          <option key={source.value} value={source.value}>
            {source.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        aria-hidden="true"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </div>
  );
}
