import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const SIDEBAR_DESKTOP_QUERY = "(min-width: 1800px)";

export function useWorkspaceSidebar() {
  const [expanded, setExpanded] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(SIDEBAR_DESKTOP_QUERY).matches,
  );
  const shell = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia(SIDEBAR_DESKTOP_QUERY);
    const change = () => setExpanded(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () =>
      shell.current?.style.setProperty(
        "--workspace-header-height",
        `${element.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { expanded, setExpanded, shell, header };
}
