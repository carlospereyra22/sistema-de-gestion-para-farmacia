import { CircleCheck, Circle } from "lucide-react";
import { useId, useState } from "react";
import type { CatalogProduct } from "./lib/api";
import { medicineSources } from "./lib/medicine-search";

type LinkedProduct = Pick<
  CatalogProduct,
  | "active"
  | "externalReferenceSource"
  | "externalReferenceName"
  | "externalReferenceCheckedAt"
>;
export function ProductSyncStatus({
  product,
  pendingName,
  pendingSource,
  showSource = false,
}: {
  product?: LinkedProduct;
  pendingName?: string;
  pendingSource?: NonNullable<CatalogProduct["externalReferenceSource"]>;
  showSource?: boolean;
}) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const linked = Boolean(
    product?.externalReferenceSource && product.externalReferenceName,
  );
  const pending = Boolean(pendingName);
  if (!linked && !pending) return null;
  const active = linked && product?.active && !pending;
  const checked = product?.externalReferenceCheckedAt;
  const source = pending ? pendingSource : product?.externalReferenceSource;
  return (
    <span
      className="relative ml-auto shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded text-xs font-medium focus-visible:outline-2 focus-visible:outline-teal-600 ${pending ? "text-amber-700" : active ? "text-emerald-700" : "text-slate-500"}`}
      >
        {active ? (
          <CircleCheck size={15} aria-hidden="true" />
        ) : (
          <Circle size={15} aria-hidden="true" />
        )}
        {pending ? "Sin guardar" : "Vinculado"}
        {showSource && source && (
          <span className="text-[11px] font-normal">
            · {medicineSources[source]}
          </span>
        )}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!open}
        className="absolute right-0 top-full z-20 w-64 max-w-[70vw] rounded-xl border border-slate-200 bg-white p-3 text-left text-xs leading-5 text-slate-600 shadow-lg"
      >
        <span className="block break-words font-semibold text-slate-900">
          {pendingName || product?.externalReferenceName}
        </span>
        {(pending ? pendingSource : product?.externalReferenceSource) && (
          <span className="block">
            Fuente:{" "}
            {
              medicineSources[
                (pending ? pendingSource : product?.externalReferenceSource)!
              ]
            }
          </span>
        )}
        {pending ? (
          <span className="mt-1 block">
            Guardá los cambios para vincular la referencia.
          </span>
        ) : (
          <>
            <span className="mt-1 block">
              {active
                ? "Revisión automática: 09:00 y 17:00 (Argentina, UTC−3)."
                : "Producto inactivo: actualización pausada."}
            </span>
            <span className="mt-1 block">
              Última revisión registrada:{" "}
              {checked && Number.isFinite(Date.parse(checked))
                ? new Date(checked).toLocaleString("es-AR", {
                    timeZone: "America/Argentina/Buenos_Aires",
                  })
                : "pendiente"}
              .
            </span>
            <span className="mt-1 block">
              Incluye vinculaciones y revisiones manuales; no indica
              necesariamente una ejecución programada.
            </span>
            <span className="mt-2 block border-t border-slate-100 pt-2">
              Actualiza el precio general de venta por caja según la
              presentación vinculada. Con «Fraccionar precio» activado, aplica
              el divisor y el recargo también a blíster y unidad. Sin esa
              configuración, blíster y unidad no se actualizan automáticamente.
              Requiere que el servidor esté encendido.
            </span>
          </>
        )}
      </span>
    </span>
  );
}
