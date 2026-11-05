import type { MedicineReference } from "./lib/api";

// Avisos que requieren atención debajo de una presentación.
export function MedicineReferenceNote({
  reference,
}: {
  reference: MedicineReference;
}) {
  if (!reference.officialDelisted && !reference.laboratoryMismatch) return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pt-1 text-[11px] leading-4">
      {reference.officialDelisted && (
        <span className="text-amber-700">
          Dado de baja en el padrón oficial
        </span>
      )}
      {reference.laboratoryMismatch && (
        <span className="text-amber-700">
          Laboratorio distinto: {reference.laboratoryMismatch}
        </span>
      )}
    </span>
  );
}
