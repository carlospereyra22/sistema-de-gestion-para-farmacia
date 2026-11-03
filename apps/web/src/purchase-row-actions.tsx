import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, ChevronDown, Eye, PackageCheck } from "lucide-react";
import type { Purchase } from "./lib/api";

type Props = {
  purchase: Purchase;
  continuing: boolean;
  busy: boolean;
  onReceive: () => void;
  onDetail: () => void;
  onCancel: () => void;
};

export function PurchaseRowActions({
  purchase,
  continuing,
  busy,
  onReceive,
  onDetail,
  onCancel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const canReceive =
    !purchase.closedAt &&
    (purchase.status === "ORDERED" || purchase.status === "PARTIALLY_RECEIVED");

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  useLayoutEffect(() => {
    if (!open || !canReceive || busy) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = menu.current?.offsetHeight ?? 96;
      const menuWidth = menu.current?.offsetWidth ?? 208;
      const below = window.innerHeight - rect.bottom >= menuHeight + 8;
      setPosition({
        top: Math.max(8, below ? rect.bottom + 6 : rect.top - menuHeight - 6),
        left: Math.max(
          8,
          Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
        ),
      });
    };
    const dismiss = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, canReceive, busy]);

  const actionStyle = !canReceive
    ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    : continuing
      ? "border-teal-700 bg-teal-700 text-white hover:bg-teal-800"
      : "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100";
  const mainLabel = canReceive
    ? continuing
      ? "Continuar recepción"
      : "Recibir"
    : "Ver detalle";

  return (
    <div
      className={`inline-flex h-9 w-52 items-stretch overflow-hidden whitespace-nowrap rounded-lg border shadow-sm ${actionStyle}`}
    >
      <button
        type="button"
        disabled={busy}
        className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 px-2 text-xs font-medium text-inherit transition-colors hover:bg-black/5 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal-500 disabled:opacity-50"
        onClick={canReceive ? onReceive : onDetail}
      >
        {canReceive ? (
          <PackageCheck size={15} aria-hidden="true" />
        ) : (
          <Eye size={15} aria-hidden="true" />
        )}
        {mainLabel}
      </button>
      {canReceive && (
        <button
          ref={trigger}
          type="button"
          disabled={busy}
          aria-label={`Más acciones de la compra ${purchase.reference ?? purchase.id}`}
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className={`grid w-8 shrink-0 place-items-center border-l text-inherit transition-colors hover:bg-black/5 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal-500 disabled:opacity-50 ${continuing ? "border-teal-500" : "border-teal-200"}`}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
      {open &&
        canReceive &&
        !busy &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={menuId}
            ref={menu}
            className="fixed z-[80] w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
            style={position}
          >
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-500"
              onClick={() => {
                setOpen(false);
                onDetail();
              }}
            >
              <Eye size={15} aria-hidden="true" />
              Ver detalle
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-slate-600 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-rose-500"
              onClick={() => {
                setOpen(false);
                onCancel();
              }}
            >
              <Ban size={15} aria-hidden="true" />
              {purchase.status === "PARTIALLY_RECEIVED"
                ? "Cancelar pendiente"
                : "Cancelar compra"}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
