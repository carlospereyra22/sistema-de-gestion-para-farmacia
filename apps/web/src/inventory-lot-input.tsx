import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { StockLot } from "./lib/api";
import { inventoryLotDetail } from "./lib/inventory-search";
import { lotNumberMatches } from "./lib/product-lots";

// Número de lote de Recibir: sugiere los lotes que el producto ya tiene en la
// sucursal, pero siempre se puede escribir uno nuevo. La API compara el número
// exacto, así que el aviso de lote existente usa ese mismo criterio.
type SuggestedLot = Pick<
  StockLot,
  "id" | "number" | "quantity" | "expiresAt" | "expiryStatus"
>;

export function InventoryLotInput<T extends SuggestedLot>({
  value,
  lots,
  productSelected,
  onChange,
  onPick,
  inputRef,
  compact,
}: {
  value: string;
  // Lotes con unidades del producto elegido, en el orden acordado.
  lots: T[];
  productSelected: boolean;
  onChange: (value: string) => void;
  onPick: (lot: T) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  // Dentro de una tabla: sin título visible y con la lista flotando por encima,
  // porque el desplazamiento de la tabla la recortaría.
  compact?: { label: string };
}) {
  const id = useId();
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const list = useRef<HTMLUListElement>(null);
  const floatingList = Boolean(compact);
  const [floating, setFloating] = useState<CSSProperties>();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const results = lots.filter((lot) => lotNumberMatches(lot.number, value));
  const number = value.trim();
  const existing = lots.find((lot) => lot.number === number);
  const hasResults = open && results.length > 0;
  // En modo flotante se muestra recién cuando ya tiene su posición.
  const showList = hasResults && (!compact || Boolean(floating));
  const pick = (lot: T) => {
    setOpen(false);
    setActive(-1);
    onPick(lot);
  };
  useEffect(() => {
    if (!floatingList || !open) return;
    const rect = input.current?.getBoundingClientRect();
    if (rect)
      setFloating({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 260),
      });
    // La lista queda fija en pantalla: si se mueve la página, se cierra. No
    // cuenta mover la propia lista ni el texto largo dentro del campo.
    const close = (event: Event) => {
      if (
        event.target === input.current ||
        (event.target instanceof Node && list.current?.contains(event.target))
      )
        return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      setFloating(undefined);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [floatingList, open, input]);
  return (
    <div
      className={compact ? undefined : "relative mt-4"}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      {compact ? null : (
        <label htmlFor={id} className="block text-sm">
          Número de lote
        </label>
      )}
      <div className={compact ? "relative" : "relative mt-1"}>
        <input
          id={id}
          ref={input}
          required={!compact}
          aria-label={compact?.label}
          title={
            compact && existing
              ? `${value} · Lote existente (${existing.quantity} un.)`
              : compact
                ? value
                : undefined
          }
          maxLength={compact ? 100 : undefined}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={`${id}-lotes`}
          aria-activedescendant={
            showList && results[active] ? `${id}-${active}` : undefined
          }
          autoComplete="off"
          value={value}
          placeholder={
            !lots.length
              ? undefined
              : compact
                ? "Elegí o escribí"
                : "Elegí un lote o escribí uno nuevo"
          }
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && showList) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(
                    results.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            // Con la lista abierta, Enter elige o la cierra: no confirma la
            // recepción por accidente.
            if (event.key === "Enter" && showList) {
              event.preventDefault();
              const lot = results[active];
              if (lot) pick(lot);
              else setOpen(false);
            }
          }}
          className={
            compact
              ? `h-9 w-full rounded-md border border-slate-200 bg-white pl-2.5 text-sm text-slate-800 outline-none focus:border-teal-500 ${number ? "pr-[74px]" : "pr-2.5"}`
              : "h-10 w-full rounded-lg border bg-white px-3 text-sm"
          }
        />
        {/* En una tabla el aviso va dentro del campo: abajo desalinearía la fila. */}
        {compact && number ? (
          <span
            className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-3 ${existing ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-700"}`}
          >
            {existing ? "Existente" : "Nuevo"}
          </span>
        ) : null}
        {showList && (
          <ul
            ref={list}
            id={`${id}-lotes`}
            role="listbox"
            aria-label="Lotes del producto"
            style={{ scrollbarWidth: "thin", ...floating }}
            className={`${compact ? "z-50" : "absolute inset-x-0 top-full z-30 mt-1"} max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-lg`}
          >
            {results.map((lot, index) => (
              <li
                id={`${id}-${index}`}
                key={lot.id}
                role="option"
                aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(lot)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm hover:bg-teal-50 ${active === index ? "bg-teal-50" : ""}`}
              >
                <span className="block break-words font-medium text-slate-800">
                  {lot.number}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                  {inventoryLotDetail(lot)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Flota en el espacio entre campos: el aviso no mueve el formulario. */}
      {compact ? null : existing ? (
        <p
          title={`Lote existente (${existing.quantity} un.): las unidades se suman y el costo y vencimiento que cargues lo reemplazan.`}
          className="absolute inset-x-0 top-full mt-0.5 truncate text-xs leading-4 text-amber-700"
        >
          Existente ({existing.quantity} un.): reemplaza costo y vencimiento.
        </p>
      ) : number && productSelected ? (
        <p className="absolute inset-x-0 top-full mt-0.5 text-xs leading-4 text-teal-700">
          Lote nuevo.
        </p>
      ) : null}
    </div>
  );
}
