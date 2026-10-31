import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function NavigationRail({
  children,
  className,
  collapsed = false,
}: {
  children: ReactNode;
  className: string;
  collapsed?: boolean;
}) {
  const [hint, setHint] = useState<{
    label: string;
    left: number;
    top: number;
  } | null>(null);
  const show = (target: EventTarget | null) => {
    if (!collapsed) return;
    const button =
      target instanceof Element ? target.closest("button[aria-label]") : null;
    const label = button?.getAttribute("aria-label");
    if (!button || !label) return;
    const bounds = button.getBoundingClientRect();
    setHint({
      label,
      left: bounds.right + 10,
      top: Math.max(
        24,
        Math.min(bounds.top + bounds.height / 2, window.innerHeight - 24),
      ),
    });
  };
  useEffect(() => {
    setHint(null);
  }, [collapsed]);
  useEffect(() => {
    const hide = () => setHint(null);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  return (
    <aside
      id="workspace-navigation"
      className={className}
      onMouseOver={(event) => show(event.target)}
      onMouseOut={(event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest("button")
            : null;
        if (
          !(event.relatedTarget instanceof Node) ||
          !button?.contains(event.relatedTarget)
        )
          setHint(null);
      }}
      onFocus={(event) => show(event.target)}
      onBlur={() => setHint(null)}
      onClick={() => setHint(null)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setHint(null);
      }}
    >
      {children}
      {hint &&
        createPortal(
          <div
            role="tooltip"
            className="navigation-rail-tooltip"
            style={{ left: hint.left, top: hint.top }}
          >
            {hint.label}
          </div>,
          document.body,
        )}
    </aside>
  );
}
