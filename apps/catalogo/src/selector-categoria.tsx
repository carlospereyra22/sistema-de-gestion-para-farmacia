import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";

/**
 * Selector de categoría con el mismo diseño que los filtros de la gestión
 * (ProductFilterSelect): lista propia, tilde en la elegida y teclado.
 */
export function SelectorCategoria({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const [abierto, setAbierto] = useState(false);
  const elegida = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [activa, setActiva] = useState(elegida);

  const abrir = () => {
    setActiva(elegida);
    setAbierto(true);
  };
  const elegir = (indice: number) => {
    const opcion = options[indice];
    if (opcion) onChange(opcion.value);
    setAbierto(false);
  };

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (event: PointerEvent) => {
      if (event.target instanceof Node && !raiz.current?.contains(event.target))
        setAbierto(false);
    };
    document.addEventListener("pointerdown", cerrar);
    return () => document.removeEventListener("pointerdown", cerrar);
  }, [abierto]);

  // La opción activa siempre a la vista al moverse con el teclado.
  useEffect(() => {
    const item = lista.current?.children[activa] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activa, abierto]);

  const filtrando = value !== "";
  return (
    <div
      ref={raiz}
      className="relative w-40 shrink-0 sm:w-64"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setAbierto(false);
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-label="Categoría"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={id}
        aria-activedescendant={abierto ? `${id}-${activa}` : undefined}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setAbierto(false);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!abierto) abrir();
            else
              setActiva((i) =>
                Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    i + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
          } else if (abierto && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            elegir(activa);
          }
        }}
        className={`flex h-12 w-full min-w-0 items-center gap-2 rounded-2xl border bg-white px-3 text-left shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
          abierto
            ? "border-teal-400 ring-2 ring-teal-500/10"
            : filtrando
              ? "border-teal-400"
              : "border-slate-200"
        }`}
      >
        <LayoutGrid size={17} className="shrink-0 text-teal-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="hidden text-[11px] font-medium leading-3 text-slate-500 sm:block">
            Categoría
          </span>
          <span
            className={`block truncate text-sm leading-5 ${
              filtrando
                ? "font-semibold text-teal-800"
                : "font-medium text-slate-800"
            }`}
          >
            {options[elegida]?.label ?? "Todas"}
          </span>
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={`shrink-0 text-teal-700 transition-transform ${abierto ? "rotate-180" : ""}`}
        />
      </button>
      {abierto ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(15,60,80,.25)]">
          <ul
            ref={lista}
            id={id}
            role="listbox"
            aria-label="Categoría"
            className="max-h-[min(20rem,60dvh)] overflow-y-auto overscroll-contain"
          >
            {options.map((opcion, indice) => (
              <li
                key={opcion.value || "todas"}
                id={`${id}-${indice}`}
                role="option"
                aria-selected={opcion.value === value}
                onPointerMove={() => setActiva(indice)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => elegir(indice)}
                className={`flex cursor-pointer items-center justify-between gap-3 break-words rounded-lg px-3 py-2.5 text-sm ${
                  indice === activa
                    ? "bg-teal-50 text-teal-800"
                    : "text-slate-600"
                } ${opcion.value === value ? "font-semibold" : ""}`}
              >
                {opcion.label}
                {opcion.value === value ? (
                  <Check
                    size={15}
                    className="shrink-0 text-teal-600"
                    aria-hidden
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
