import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ProductActionsMenu({
  anchor,
  onClose,
  children,
}: {
  anchor: HTMLButtonElement;
  onClose: () => void;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const [position, setPosition] = useState<{ top: number; left: number }>();
  useLayoutEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useLayoutEffect(() => {
    function place() {
      if (!anchor.isConnected) {
        close.current();
        return;
      }
      const bounds = anchor.getBoundingClientRect();
      const height = menu.current?.offsetHeight ?? 150;
      const top =
        window.innerHeight - bounds.bottom < height + 12 &&
        bounds.top > height + 12
          ? bounds.top - height - 6
          : bounds.bottom + 6;
      setPosition({
        top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
        left: Math.max(
          8,
          Math.min(bounds.right - 208, window.innerWidth - 216),
        ),
      });
    }
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !anchor.contains(event.target)
      )
        close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close.current();
        anchor.focus();
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={menu}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
      className="fixed z-40 max-h-[calc(100dvh-16px)] w-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
    >
      {children}
    </div>,
    document.body,
  );
}
