import type { MedicineReference } from "./lib/api";
import { ProductFilterSelect } from "./product-filter-select";

const productReferenceSources = [
  { value: "official", label: "Medicamentos" },
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
    <div className="w-[152px] shrink-0">
      <ProductFilterSelect
        compact
        label="Fuente para buscar por nombre"
        icon={null}
        value={value}
        options={[...productReferenceSources]}
        onChange={(selected) => {
          const source = productReferenceSources.find(
            (item) => item.value === selected,
          );
          if (source) onChange(source.value);
        }}
      />
    </div>
  );
}
