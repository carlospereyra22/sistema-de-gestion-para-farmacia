import { useEffect, useRef, type RefObject } from "react";
import { isProductScan } from "./lib/product-scan";

// Keyboard-wedge readers send a short burst followed by Enter. Slow typing,
// modified keys and nested dialogs must keep their normal behavior.
export function useProductScanner(
  input: RefObject<HTMLInputElement | null>,
  onScan: (code: string) => void,
  disabled: boolean,
) {
  const latest = useRef({ onScan, disabled });
  useEffect(() => {
    latest.current = { onScan, disabled };
  }, [onScan, disabled]);
  useEffect(() => {
    let digits = "";
    let last = 0;
    let start = 0;
    let target: EventTarget | null = null;
    let original = "";
    const listen = (event: KeyboardEvent) => {
      const dialog = input.current?.closest("dialog");
      if (
        latest.current.disabled ||
        !dialog?.open ||
        !(event.target instanceof HTMLElement) ||
        event.target.closest("dialog") !== dialog ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.isComposing ||
        event.repeat
      ) {
        digits = "";
        return;
      }
      const now = performance.now();
      if (/^[0-9]$/.test(event.key)) {
        if (
          !digits ||
          now - last > 60 ||
          target !== event.target ||
          digits.length >= 14
        ) {
          digits = "";
          start = now;
          target = event.target;
          original =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement
              ? target.value
              : "";
        }
        digits += event.key;
        last = now;
        return;
      }
      if (
        event.key === "Enter" &&
        isProductScan(digits, start, last, now) &&
        event.target === target
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          const prototype =
            target instanceof HTMLInputElement
              ? HTMLInputElement.prototype
              : HTMLTextAreaElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
            target,
            original,
          );
          target.dispatchEvent(
            new CustomEvent("input", {
              bubbles: true,
              detail: "product-scanner-restore",
            }),
          );
        }
        latest.current.onScan(digits);
        input.current?.focus({ preventScroll: true });
        input.current?.select();
      }
      digits = "";
    };
    document.addEventListener("keydown", listen, true);
    return () => document.removeEventListener("keydown", listen, true);
  }, [input]);
}
