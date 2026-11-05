import { ChevronDown } from "lucide-react";

// Celda Lote de Productos: el lote principal (el mismo de Próx. venc. y Estado)
// y, si hay más, un botón "+N" que despliega el detalle de lotes.
export function ProductLotCell({
  productName,
  lotNumber,
  total,
  open,
  controlsId,
  onToggle,
  expandable = false,
}: {
  productName: string;
  lotNumber?: string;
  total: number;
  open: boolean;
  controlsId: string;
  onToggle: () => void;
  // Un único lote también se despliega si entró con varios costos.
  expandable?: boolean;
}) {
  if (!lotNumber) return <span className="text-slate-400">—</span>;
  const others = total - 1;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {/* Los lotes largos se cortan para no ensanchar la columna. */}
      <span className="max-w-36 truncate" title={lotNumber}>
        {lotNumber}
      </span>
      {others > 0 || expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={controlsId}
          aria-label={`${open ? "Ocultar" : "Ver"} ${others > 0 ? `${total} lotes` : "costos del lote"} de ${productName}`}
          onClick={onToggle}
          className={`inline-flex h-6 items-center gap-0.5 rounded-full border px-2 text-xs font-medium transition-colors ${open ? "border-teal-600 bg-teal-600 text-white" : "border-teal-200 bg-teal-50 text-teal-800 hover:border-teal-400"}`}
        >
          {others > 0 ? `+${others}` : null}
          <ChevronDown
            size={14}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}
    </span>
  );
}
