import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleAlert, X } from "lucide-react";
import { scheduleToastDismiss } from "./lib/toast-auto-dismiss";

export function StatusToast({
  message,
  onClose,
  variant = "success",
  title,
  action,
}: {
  message: string;
  onClose: () => void;
  variant?: "success" | "error";
  title?: string;
  action?: { label: string; onClick: () => void };
}) {
  const close = useRef(onClose);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    return scheduleToastDismiss(
      () => close.current(),
      variant,
      hovered || focused,
    );
  }, [message, hovered, focused, variant]);
  return (
    <div
      className={`${variant === "error" ? "notification-slide-in fixed bottom-6 right-4 border-rose-100 sm:right-6" : "fixed bottom-6 right-6 border-teal-100"} z-[60] flex max-h-[calc(100dvh-7rem)] w-[calc(100%-2rem)] max-w-sm items-start gap-3 overflow-y-auto rounded-2xl border bg-white p-4 shadow-[0_12px_40px_rgb(15_23_42_/_16%)]`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${variant === "error" ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-700"}`}
      >
        {variant === "error" ? (
          <CircleAlert size={20} aria-hidden="true" />
        ) : (
          <CircleCheck size={20} aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div
          role={variant === "error" ? "alert" : "status"}
          aria-live={variant === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {title && (
            <p className="mb-1 text-sm font-semibold text-slate-900">{title}</p>
          )}
          <p className="whitespace-pre-line break-words text-sm leading-5 text-slate-600">
            {message}
          </p>
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-3 inline-flex rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar notificación"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-teal-600"
      >
        <X size={16} />
      </button>
    </div>
  );
}
