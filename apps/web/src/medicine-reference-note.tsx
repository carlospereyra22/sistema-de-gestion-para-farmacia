import { ExternalLink } from "lucide-react";
import type { MedicineReference } from "./lib/api";
import { medicineReferenceLink } from "./lib/medicine-search";

// Link de referencia y avisos de un medicamento de la base. Va fuera del botón
// que lo elige: un link no puede estar dentro de un botón.
export function MedicineReferenceNote({
  reference,
}: {
  reference: MedicineReference;
}) {
  const link = medicineReferenceLink(reference);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pt-1 text-[11px] leading-4">
      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1 text-teal-700 hover:underline"
        >
          <ExternalLink size={11} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{link.label}</span>
        </a>
      )}
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
